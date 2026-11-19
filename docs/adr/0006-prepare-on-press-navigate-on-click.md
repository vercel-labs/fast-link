# Prepare on press, navigate on accepted click

Fast Link can start router work on eligible mouse press and wait for an accepted
click to navigate. This keeps release-time cancellation, which press navigation
gives up, while still starting work before release.

Core owns one gesture controller and opaque preparation. It prepares on press,
tracks cancellation until the click, and returns a once-only candidate for the
matching click. Adapters accept that candidate after their synchronous guards,
prevent the click's default action, and navigate. Core never prevents the click
or navigates on this path.

A prepared result belongs to the authored `href` and resolved URL captured at
press. Accepting the click rechecks live eligibility and anchor priority. A
changed destination keeps click-time navigation but discards reuse. Adapters
own provider handles: changes to policy callback identity, history method,
scroll, or transitions do not make prepared work stale, but current policy must
still choose router navigation.

A link component can accept after caller click guards and the framework's
navigation guards. Regions and custom-renderer hooks accept during click
capture, after their supplied guards; later child guards cannot cancel.
Consumers that need those later guards use a managed link or opt out. Waiting
for arbitrary renderers' callbacks would require another adapter protocol.

Preparation failures leave ordinary click-time routing available. A failed
navigation is never retried because it may already have started. Discarding
preparation does not abort provider work.

Implementation: [`createClickPreparation`](../../packages/core/src/preparation/index.ts)
and its [gesture engine](../../packages/core/src/preparation/gesture.ts). The
[preparation tests](../../packages/core/src/preparation/index.test.ts) cover
cancellation, matching, revalidation, and cleanup.
