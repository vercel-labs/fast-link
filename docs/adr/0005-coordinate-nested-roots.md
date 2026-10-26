# Coordinate anchor controllers and containing regions

Capture listeners on a containing region run before listeners on an anchor.
Event deduplication alone would let the region take an interaction before the
anchor can apply its own routing options. Core registers anchor ownership so
managed links inside a region retain per-link options, cancellation, and policy.

- A live anchor controller takes priority over every containing root, even
  when disabled. A region cannot turn early navigation back on for a disabled
  managed link.
- Core shares ownership counts across bundled copies in a `WeakMap`. Ownership
  ends when the last controller for that anchor is destroyed, without keeping
  removed anchors alive.
- Nested regions retain capture ordering from the outside in. Anchor priority
  does not make the innermost region win.

Core also marks accepted events with a shared symbol so separately bundled
copies can recognize a handled press. A shared `WeakSet` deduplicates events
when the event cannot accept the symbol property. These mechanisms coordinate
nested roots and multiple package copies without relying on listener attachment
order for anchor priority.

## Shared coordination contract

The internal [coordination module](../../packages/core/src/coordination/index.ts)
owns the keys, types, and initialization. One registry on `globalThis`, under
`Symbol.for('@fast-link/core/coordination')`, holds four weak collections:

| Field                | Meaning                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `anchorOwners`       | Number of live controllers for each managed anchor, including disabled controllers. |
| `pendingClickOwners` | Callback that consumes an anchor's pending follow-up click.                         |
| `suppressedClicks`   | Click events already consumed during capture.                                       |
| `handledEvents`      | Accepted presses, including non-extensible events.                                  |

The event marker remains `Symbol.for('@fast-link/core/handled-event')` with the
value `true`. Core attempts to set it on accepted events, separately from the registry.
The registry and marker are internal coordination contracts between versions,
not package exports.

Compatible versions reuse the same registry object and collection instances.
A version that adds compatible fields must initialize missing fields on the
existing registry before using them. Preserve the registry and collection
identities, existing field names and meanings, callback behavior, and live
ownership and suppression state. The current schema needs no backfill.

The first schema addition must include mixed-version tests through public
controllers. Load the old version before the new version, then test the reverse
order. Both load orders must preserve live anchor ownership, pending click
suppression, and event deduplication, including non-extensible events.

Use the same keys across package versions. Separate registries would lose
shared ownership and deduplication. An incompatible change needs an explicit plan for
versions to coexist, including non-extensible events that rely on the shared
`handledEvents` collection.

Controllers own registration and cleanup; weak collections do not keep anchors
or events alive. The [controller tests](../../packages/core/src/controller/index.test.ts)
cover independently loaded copies, disabled anchors, click suppression, and
ownership cleanup through controller behavior.
