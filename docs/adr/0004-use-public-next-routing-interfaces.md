# Use public Next Link and App Router interfaces

The Next adapter uses public `next/link` and App Router interfaces. Depending
on private Next modules would couple early navigation to implementation details
outside Next's public compatibility contract.

`FastLink` delegates rendering, native activation, and prefetching to `next/link`.
It uses optional public `router.experimental_prepare` on eligible press, then
commits after caller `onClick`, Next's native checks, and caller `onNavigate`.
The supported experimental runtime and flag are in the package requirements.
Without preparation it routes at accepted click. Failed commits are not retried.

One synchronous, side-effect-free navigation policy supplies both early
ownership classification and the accepted-click decision. This requires a
consumer purity migration, but keeps one authoritative ownership rule. Effects
belong in navigation callbacks. Guards can commit new props synchronously, so
acceptance reads current committed configuration before reusing a handle.

The Next `useFastLink` hook and `FastLinkRegion` prepare on press and accept
navigation during click capture. `FastLink` owns Next guard composition; capture
adapters cannot wait for later child guards. See [ADR 0006](./0006-prepare-on-press-navigate-on-click.md).

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

Core owns gesture identity, eligibility, cancellation, ownership, and cleanup.
React owns committed options and ref lifetime. Next owns prepared handles,
routing options, policy binding, and framework callback composition. Discarding
a handle does not abort provider work. The preparation API alone does not repair
Chrome attribution on the supported runtime; renderer fixes remain upstream.

`as` and `legacyBehavior` are outside the public Fast Link contract. Custom
renderers require an anchor and `href`; they own native activation and prefetching.

Implementation: [`FastLink`](../../packages/next/src/fast-link/index.tsx),
[`useFastLink`](../../packages/next/src/use-fast-link/index.ts), and
[`FastLinkRegion`](../../packages/next/src/fast-link-region/index.tsx).
The [FastLink tests](../../packages/next/src/fast-link/index.test.tsx) and
[FastLinkRegion tests](../../packages/next/src/fast-link-region/index.test.tsx) check
routing inputs and base-path handling.
