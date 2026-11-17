# TanStack Router and TanStack Start

Use `FastLink` from `@fast-link/tanstack` under a TanStack Router provider.
It keeps typed `to`, `from`, params, search, state, masks, active props and
preloading. History, scroll, transitions and blockers remain owned by Router.
Supply `from` explicitly for relative links across nested routing contexts.

`useFastLink` binds an existing TanStack Link renderer. Pass the same navigation
options and spread both returned bindings after other anchor props.

`FastLinkRegion` routes ordinary anchors using their rendered public URL. It
cannot infer per-link TanStack options. Managed links keep their own options even
when disabled. Exclude document reloads, foreign application URLs and click-time
guards with `data-no-fast-link`.

Use `enabled={false}` for release-time guards. Router blockers remain effective
on early navigation. TanStack can skip click observers after suppression; use
`onFastNavigate` when observation must run on an accepted press.

This adapter is not published to npm yet. Build and pack the workspace, then
install core, React and TanStack archives together. Confirm publication before
suggesting a registry install.
