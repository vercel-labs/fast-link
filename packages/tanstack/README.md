# @fast-link/tanstack

Early primary-mouse navigation for **TanStack Router** and **TanStack Start**.
Reuses Fast Link's core interaction rules and React lifecycle; TanStack owns
routing, preloading, active links, blockers, history, and scroll options.

This package is implemented in [viktorlarsson/fast-link](https://github.com/viktorlarsson/fast-link).
It is not published to npm yet. Build the workspace with `pnpm install && pnpm build`,
then use the packed archives for core, React, and TanStack (see the repository's
packaging commands). Installing this monorepo directly as an npm Git dependency
does not install this subpackage.

Requires Node.js >=22, React >=19 <20 and `@tanstack/react-router` >=1.170.46 <2.
TanStack Start applications use the same adapter through their Router provider.

```tsx
import { FastLink } from '@fast-link/tanstack';

<FastLink
  to="/posts/$postId"
  params={{ postId: '42' }}
  search={{ tab: 'details' }}
  replace
  resetScroll={false}
>
  Open post
</FastLink>;
```

`FastLink` preserves TanStack's registered route types, required path params,
search validation, `from`, relative destinations, state, masks, base paths,
active/inactive props, render-function children and preloading. Navigation uses
`router.navigate()` with the original options, including blockers and view
transitions. Route loaders and router subscriptions supply pending UI.

Primary unmodified mouse presses on eligible same-origin links navigate early.
Core suppresses the matching click to prevent a second navigation. Click capture
and bubbling still propagate. TanStack may skip an `onClick` handler when the click
has already been prevented. Put observations in `onFastNavigate` when they must
run for early navigation.

Touch, pen, keyboard, modified clicks, downloads, external links and hash-only
links keep their ordinary handling. `disabled` and `reloadDocument` links do not
navigate early. `enabled={false}` and `data-no-fast-link` opt out.

For click-time guards or release-sensitive actions, use `enabled={false}`.
TanStack Router blockers still apply to early navigation. Moving away before
release does not cancel accepted navigation; see the root README's known limitations.
When using relative links across nested routing contexts, supply `from` explicitly
so the early and ordinary navigations share the same route base.

## Regions

```tsx
import { FastLink, FastLinkRegion } from '@fast-link/tanstack';

<FastLinkRegion resetScroll={false}>
  <nav>
    <a href="/app/overview">Overview</a>
    <FastLink to="/settings" replace>
      Settings
    </FastLink>
    <a href="/sign-out" data-no-fast-link>
      Sign out
    </a>
  </nav>
</FastLinkRegion>;
```

A region routes ordinary same-origin anchors with `router.navigate({ href })`,
using the rendered public URL, including the router base path. Managed `FastLink`
anchors retain their own options, even when disabled. Regions can specify
`replace`, `resetScroll`, `enabled`, and `onFastNavigate` for ordinary anchors.

A region cannot recover `state`, masks, blockers bypass, or other TanStack Link
props from an ordinary anchor. Use `FastLink` for those options. Keep regions
narrow and add `data-no-fast-link` to click-time guards, document-reload links,
API endpoints, or pages owned by another application. Same origin does not
establish router ownership.

## Custom renderers

```tsx
import { Link } from '@tanstack/react-router';
import { useFastLink } from '@fast-link/tanstack';

function AccountLink() {
  const options = { to: '/account', resetScroll: false } as const;
  const attach = useFastLink(options);
  return (
    <Link {...options} {...attach}>
      Account
    </Link>
  );
}
```

Spread both bindings after other props, on the anchor owned by TanStack Link.
Pass the same navigation options to the hook and renderer. The hook accepts
`disabled`, `forwardedRef`, and `onClickCapture`; the caller owns preloading,
active-state presentation, and ordinary click behavior. Keep disabled hooks
attached so containing regions respect anchor ownership.

## Verification

The package has tests against a real memory router and a production Vite fixture
using the built public export. From the repository root:

```sh
pnpm --filter @fast-link/tanstack... build
pnpm --filter @fast-link/tanstack test
pnpm --filter @fast-link/fixture-tanstack... build
pnpm --filter @fast-link/fixture-tanstack test:fixtures
```

The browser fixture covers early navigation, duplicate prevention, keyboard
activation, native opt-outs, masks, base paths, and history replacement. A
TanStack Start server-rendering deployment is not part of this fixture.
