# Enforce root activity in core

A framework ref can detach a root and reattach it within one commit, so the
adapter keeps the controller alive while the root is detached. Core enforces
whether the root is active, and adapters only report it.
`createLinkInteraction` and `createClickPreparation` accept an optional
`isActive` callback. They check it before claiming a press, preparing, or
arming follow-up click suppression, and again before an immediate press
navigates. The React root binding passes its `isAttached` check.

An adapter wrapper that rejects core's callbacks while detached cannot order
this correctly. Immediate mode arms follow-up click suppression before it calls
`beforeNavigate`. A wrapper that rejects activation from that callback acts too
late: the next click is prevented and nothing navigates. The wrapper would also
make each adapter depend on the selected mode. Core already owns eligibility,
event ordering, and suppression.

- Any framework adapter gets correct ordering by reporting attachment.
- Core gains one optional parameter, which defaults to always active.
- A press on a detached root stays native. The root keeps its region
  ownership, so containing regions leave the link native too.
- Suppression armed before detachment still applies and settles as usual.
- A guard that detaches the root cancels immediate navigation, and its
  follow-up click stays suppressed.

Implementation: [link interaction](../../packages/core/src/link-interaction/index.ts),
[click preparation](../../packages/core/src/preparation/index.ts), and the
[React root binding](../../packages/react/src/root-binding/index.ts). The core
[README](../../packages/core/README.md#createlinkinteraction) documents the
caller contract.
