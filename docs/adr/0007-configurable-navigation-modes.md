# Make early navigation an explicit mode

Consumers need a choice between keeping release-time cancellation and
navigating as early as possible. One controller per root selects a mode:

| Mode        | Behavior                                                                |
| ----------- | ----------------------------------------------------------------------- |
| `release`   | Prepare on eligible mouse press; navigate on an accepted click.         |
| `immediate` | Navigate on eligible mouse press. Releasing away cannot cancel it.      |
| `native`    | Leave navigation to ordinary link behavior; it does not force a reload. |

Both accelerated modes keep touch, pen, keyboard, and modified input native,
along with the existing eligibility checks and opt-outs. Release means an
accepted click, not a raw `pointerup`. Opting in does not establish WCAG
conformance.

The controller persists across mode changes, so the DOM node and its root
registration stay in place. Leaving release mode discards preparation without
navigating retroactively; switching back cannot revive it. Follow-up click
suppression from an accepted immediate press survives every update, including
a change to native mode, and settles on its click, the next press at the root,
or destruction. Only the selected path does work: immediate mode allocates no
preparation or cancellation tracking, release mode creates no suppression
claim, and native mode constructs neither.
All three modes ship in every entry point; selecting a mode at runtime
doesn't reduce bundle size.

The core controller requires an explicit mode. Framework entry points that
adopt modes will apply the `release` default and replace a separate `enabled`
control with `native`.
The preparation-only controller keeps its `enabled` option.

This supersedes the universal click-only rule in
[ADR 0006](./0006-prepare-on-press-navigate-on-click.md); its preparation,
acceptance, and failure contracts apply to release mode.
[ADR 0002](./0002-start-navigation-on-mouse-pointerdown.md) describes immediate
mode. [ADR 0008](./0008-use-closest-region-for-ordinary-links.md) defines how
modes combine in nested regions.

Implementation: [`createLinkInteraction`](../../packages/core/src/link-interaction/index.ts).
