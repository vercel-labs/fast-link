# Use public Next Link and App Router interfaces

The Next adapter starts early navigation through public App Router calls.
`FastLink` renders `next/link`; the Next `useFastLink` hook lets applications own
rendering and prefetching. Both share cancellation, route construction, and
router options without importing private Next modules.

- `FastLink` retains the original Link routing inputs, including history and
  scroll options. It calls `onNavigate` before policy or observation and honors
  cancellation. Its `next/link` renderer handles native activation and
  prefetching.
- `FastLinkRegion` delegates from a `display: contents` div to existing
  anchors. Those anchors do not expose every Next Link prop, so ordinary links
  share the region's policy and push history. Use `FastLink` or the Next
  `useFastLink` hook inside the region for per-link options.
- A region's caller supplies the configured `basePath`. The region removes one
  matching prefix from the rendered pathname before `router.push()`, because
  Next adds the base path when routing. Managed links use their original Link
  routing inputs instead of stripping the rendered path.
- `as` and `legacyBehavior` keep `FastLink` on its normal Link path. Legacy
  rendering does not attach an anchor controller, so add `data-no-fast-link`
  when that anchor needs native handling inside a region.

Public App Router calls do not update Link's `useLinkStatus().pending` state.
Applications use route-level loading UI or track pending state through
`onFastNavigate`. Using private Link internals to set that state would couple
the adapter to Next implementation details.

Implementation: [`FastLink`](../../packages/next/src/fast-link/index.tsx),
[`useFastLink`](../../packages/next/src/use-fast-link/index.ts), and
[`FastLinkRegion`](../../packages/next/src/fast-link-region/index.tsx).
The [FastLink tests](../../packages/next/src/fast-link/index.test.tsx) and
[FastLinkRegion tests](../../packages/next/src/fast-link-region/index.test.tsx) check
routing inputs and base-path handling.
