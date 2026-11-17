# TanStack Router and TanStack Start

Use `FastLink` from `@fast-link/tanstack` under a TanStack Router provider.
It keeps typed `to`, `from`, params, search, state, masks, active props and
preloading. History, scroll, transitions and blockers remain owned by Router.
Supply `from` explicitly for relative links across nested routing contexts.

`useFastLink` binds an existing TanStack Link renderer. Pass the same navigation
options and spread both returned bindings after other anchor props.

`FastLinkRegion` routes ordinary anchors using their rendered public URL. It
cannot infer per-link TanStack options. Managed links keep their own options even
when disabled. Without a `navigationPolicy`, URLs outside the base path, without
a matching route, or matching a server-only Start route load as documents.
Exclude document reloads and click-time guards with `data-no-fast-link`.

All three bindings accept `navigationPolicy(intent, proposed)`; `proposed.owned`
reports router ownership. `onFastNavigate(intent, decision)` matches the Next
adapter.

Use `enabled={false}` for release-time guards. Router blockers remain effective
on early navigation. TanStack can skip click observers after suppression; use
`onFastNavigate` when observation must run on an accepted press.
