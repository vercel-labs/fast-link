# Enforce root activity in core

A framework ref can detach a root and reattach it within one commit, so the
adapter keeps the controller alive while the root is detached. Core enforces
whether the root is active, and adapters only report it.
Until the controller is destroyed it still receives input, and a guard or
caller ref cleanup can dispatch a press while the root is detached. A detached
root must not prepare, navigate, or arm click suppression for an owner that has let
it go.
`createLinkInteraction` and `createClickPreparation` accept an optional
`isActive` callback. They check it before claiming a press, preparing, or
arming follow-up click suppression, and again before an immediate press
navigates or a release click is matched or consumed. The React root binding
passes its `isAttached` check.

An adapter wrapper that rejects core's callbacks while detached cannot order
this correctly. Immediate mode arms follow-up click suppression before it calls
`beforeNavigate`. A wrapper that rejects activation from that callback acts too
late: every immediate press on a detached root suppresses its own follow-up
click, and nothing navigates. The wrapper would also make each adapter depend
on the selected [mode](./0007-configurable-navigation-modes.md). Core already
owns eligibility, event ordering, and suppression.

- Any framework adapter gets correct ordering by reporting attachment.
- `createLinkInteraction` and `createClickPreparation` each gain an optional
  third parameter that defaults to always active. It sits outside `options`
  because `update()` replaces options, while the owner reports attachment for
  the controller's lifetime.
- A press on a detached root stays native. The root keeps its region
  ownership, so containing regions leave the link native too; see
  [ADR 0008](./0008-use-closest-region-for-ordinary-links.md).
- Suppression armed before detachment still applies and settles as usual.
- A guard that detaches the root cancels immediate navigation, and its
  follow-up click stays suppressed, as with a guard that returns `false`.

Implementation: [link interaction](../../packages/core/src/link-interaction/index.ts),
[click preparation](../../packages/core/src/preparation/index.ts), and the
[React root binding](../../packages/react/src/root-binding/index.ts). The
root activity cases in the
[link interaction tests](../../packages/core/src/link-interaction/index.test.ts)
cover detached presses, guards, release clicks, and earlier suppression. The core
[README](../../packages/core/README.md#createlinkinteraction) documents the
caller contract.
