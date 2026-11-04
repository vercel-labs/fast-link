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
shares two weak collections between bundled copies of the current contract:

- `anchorOwners` counts live controllers for each anchor, including disabled controllers.
- `handledEvents` records accepted presses and consumed clicks, including events
  that cannot hold a symbol marker.

The registry uses `Symbol.for('@fast-link/core/coordination')`. Accepted events
also receive `Symbol.for('@fast-link/core/handled-event')` when possible.
Both mechanisms remain necessary for independently bundled copies and frozen events.

Controllers own registration and cleanup. Weak collections retain neither
anchors nor events. The [preparation tests](../../packages/core/src/preparation/index.test.ts)
cover cross-copy event claims, disabled anchors, live ownership changes, and cleanup.
The clean break in [ADR 0006](./0006-prepare-on-press-navigate-on-click.md) removes
the pending-click owner and suppression collections. Coexistence with the removed
press-navigation contract is not supported.
