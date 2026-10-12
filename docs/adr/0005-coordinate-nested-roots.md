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
copies can recognize a handled press. A local `WeakSet` deduplicates events
within a copy when the event cannot accept the symbol property. These mechanisms
coordinate nested roots and multiple package copies without relying on listener
attachment order for anchor priority.

Implementation: [anchor ownership](../../packages/core/src/controller/index.ts#L8)
and [event markers](../../packages/core/src/interaction/index.ts#L100).
The [controller tests](../../packages/core/src/controller/index.test.ts#L252)
cover package copies, disabled anchors, and ownership cleanup.
