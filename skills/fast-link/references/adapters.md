# Core and React adapters

Use `createClickPreparation` from `@fast-link/core` for DOM or framework
integration. Use `useClickPreparation` from `@fast-link/react` when React owns
the root. Both prepare work without navigating and expose click matching.

## Assign ownership

- Core owns eligibility, gesture identity, cancellation, and anchor priority.
- React owns committed options, composed refs, and controller teardown.
- The adapter owns speculative work, synchronous click guards, default prevention,
  routing, history, scroll, route state, and transitions.

Match the native click before running cancellation handlers. If they allow
navigation, consume the candidate and navigate only when it returns a result.
Call `preventDefault()` before navigating. Always discard any returned candidate in
`finally`. Complete this sequence synchronously during the click event.

Follow the [core click-handling procedure](https://github.com/vercel-labs/fast-link/tree/main/packages/core#createclickpreparation)
for return values and cancellation rules.

Preparation must not navigate. Failed preparation leaves click-time fallback
available. Destroy controllers when roots detach; the React binding does this
through its ref. Discarding preparation does not abort provider work.

For complete examples and lifecycle details, read the
[core README](https://github.com/vercel-labs/fast-link/tree/main/packages/core)
and [React README](https://github.com/vercel-labs/fast-link/tree/main/packages/react).

## Iframes

Load and initialize Fast Link inside each controlled iframe. Parent controllers
do not receive child-document events, and parent-loaded controllers attached to
iframe elements are unsupported. Resolve URLs against the anchor's document.

## Router or document navigation

Use core's `runFastNavigation` after acceptance when the adapter selects between
router and document navigation. The application supplies ownership policy;
core owns decision validation and failure ordering. Read [Routing decisions](routing.md).
