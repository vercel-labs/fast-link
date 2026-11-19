# Let the closest region configure ordinary links

An ordinary link's closest region supplies its mode and navigation policy
together. Managed links keep their own configuration over every region,
including a managed native link. This replaces outside-in region precedence so
local configuration behaves consistently:

- A native inner region blocks acceleration by any containing link interaction
  region.
- An accelerated inner region re-enables acceleration inside a native region.
- No outer policy takes over when the closest region is native.

Capture listeners on a containing region run before those of a closer one, so
event deduplication alone cannot provide this rule. Every link interaction
root registers when attached, in every mode, in the shared coordination
registry. Before any preparation, policy call, or event claim, core checks that
the root owns the anchor: the anchor is the root, or it has no managed
controller and no registered region lies between it and the root. Core
rechecks ownership after an immediate guard and before a release click is
consumed. A root that loses does no work for that interaction.

This supersedes only the nested-region precedence in
[ADR 0005](./0005-coordinate-nested-roots.md) for link interaction roots.
Anchor priority, shared event markers, and cross-copy coordination remain
required. `createClickPreparation` roots neither register
nor check regions: they follow outside-in capture order, including when nested
with link interaction regions, and still defer to managed anchors.

Implementation: [ownership](../../packages/core/src/link-interaction/ownership.ts)
and the [link interaction tests](../../packages/core/src/link-interaction/index.test.ts),
which cover every region mode pair across separately loaded copies.
