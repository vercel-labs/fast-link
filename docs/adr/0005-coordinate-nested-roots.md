# Coordinate anchor controllers and containing regions

Capture listeners on a containing region run before listeners on an anchor.
Event deduplication alone would let the region take an interaction before the
anchor can apply its own routing options. Core registers anchor ownership so
managed links inside a region retain per-link options, cancellation, and policy.

- A live anchor controller takes priority over every containing root, even
  when disabled or native. A region cannot turn early navigation back on for a
  disabled or native managed link.
- Core shares ownership counts across bundled copies in a `WeakMap`. Ownership
  ends when the last controller for that anchor is destroyed, without keeping
  removed anchors alive.
- Nested preparation-only regions retain capture ordering from the outside
  in. Anchor priority does not make the innermost region win. Link
  interaction regions use the closest region instead; see
  [ADR 0008](./0008-use-closest-region-for-ordinary-links.md).

Core also marks accepted events with a shared symbol so separately bundled
copies can recognize a handled press. A shared `WeakSet` deduplicates events
when the event cannot accept the symbol property. These mechanisms coordinate
nested roots and multiple package copies without relying on listener attachment
order for anchor priority.

Prepared clicks are not marked. Only one root claims each press, and every new
press discards pending preparation in its document, so at most one candidate
can match a click.

## Shared coordination contract

The internal [coordination module](../../packages/core/src/coordination/index.ts)
owns the keys, types, and initialization. Bundled copies in the same JavaScript
realm share one registry on `globalThis`, under
`Symbol.for('@fast-link/core/coordination')`, with five weak collections:

| Field                | Meaning                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `anchorOwners`       | Number of live controllers for each managed anchor, including disabled controllers. |
| `pendingClickOwners` | Callback that consumes an anchor's pending follow-up click.                         |
| `suppressedClicks`   | Click events already consumed during capture.                                       |
| `handledEvents`      | Accepted presses, including non-extensible events.                                  |
| `regionOwners`       | Number of live link interaction controllers for each containing root, in any mode.  |

Core also attempts to set `Symbol.for('@fast-link/core/handled-event')` to
`true` on accepted events. The shared `handledEvents` collection covers events
that cannot accept this marker. The registry and marker are internal
coordination contracts between independently bundled package versions.

Compatible versions reuse the same registry object and collection instances.
A version that adds compatible fields must initialize missing fields on the
existing registry before using them. Preserve the registry and collection
identities, existing field names and meanings, callback behavior, and live
ownership and suppression state.

A schema addition must include mixed-version tests through public controllers,
with versions loaded in either order. Both load orders must preserve live
anchor ownership, pending click suppression, and event deduplication, including
non-extensible events.

Use the same keys across package versions. Separate registries would lose
shared ownership and deduplication. An incompatible change needs an explicit plan for
versions to coexist, including non-extensible events that rely on the shared
`handledEvents` collection.

Versions before `regionOwners` create a registry without it; later versions add
the field to that registry in place. Immediate controllers in separately
bundled copies share `pendingClickOwners` and `suppressedClicks`, so a
containing root from one copy can suppress a follow-up click owed to another.
Core copies older than 0.1.0 don't register regions, so they keep outside-in
precedence, and a native inner region doesn't block an older outer region.

Controllers own registration and cleanup; weak collections do not keep anchors
or events alive. The [preparation tests](../../packages/core/src/preparation/index.test.ts) and
[link interaction tests](../../packages/core/src/link-interaction/index.test.ts)
cover independently loaded copies, an earlier registry, disabled and native
anchors, click suppression, and ownership cleanup through controller behavior.
