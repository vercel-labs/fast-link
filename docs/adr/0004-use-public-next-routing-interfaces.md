# Use public Next Link and App Router interfaces

The Next adapter uses public `next/link` and App Router interfaces. Depending
on private Next modules would couple early navigation to implementation details
outside Next's public compatibility contract.

`FastLink` delegates rendering, native activation, and prefetching to `next/link`.
It starts accepted presses through the App Router using the original Link
routing inputs, honoring `onNavigate` cancellation before policy or observation.
The Next `useFastLink` hook shares this routing behavior while leaving rendering
and prefetching to its caller.

`FastLinkRegion` delegates early navigation for ordinary anchors. Rendered
anchors do not expose every Next Link prop, so they share the region's policy
and push history. Applications supply configuration the region cannot read
from anchors, including a configured `basePath`; managed links retain their
own routing inputs. The [Next integration guide](../../packages/next/README.md#add-fast-link-to-a-navigation-region)
documents region setup and its limits.

Public App Router calls do not update Link's `useLinkStatus().pending` state.
Applications use route-level loading UI or track pending state through
`onFastNavigate`. Using private Link internals to set that state would couple
the adapter to Next implementation details.

Rendering modes the adapter does not accelerate stay on the normal Link path.
See the [navigation rules](../../packages/next/README.md#understand-navigation-and-click-behavior)
for `as`, `legacyBehavior`, and native opt-outs.

Implementation: [`FastLink`](../../packages/next/src/fast-link/index.tsx),
[`useFastLink`](../../packages/next/src/use-fast-link/index.ts), and
[`FastLinkRegion`](../../packages/next/src/fast-link-region/index.tsx).
The [FastLink tests](../../packages/next/src/fast-link/index.test.tsx) and
[FastLinkRegion tests](../../packages/next/src/fast-link-region/index.test.tsx) check
routing inputs and base-path handling.
