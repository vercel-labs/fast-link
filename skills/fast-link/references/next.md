# Next.js App Router integration

Read this when using `@fast-link/next`. Verify the installed package's peer
range against the application's Next.js and React versions. Import public
exports from `@fast-link/next`; Fast Link does not need private Next.js modules.

## Regions for ordinary links

```tsx
import { FastLinkRegion } from '@fast-link/next';
import Link from 'next/link';

export function Navigation() {
  return (
    <FastLinkRegion>
      <nav>
        <Link href="/overview">Overview</Link>
        <Link href="/pricing">Pricing</Link>
      </nav>
    </FastLinkRegion>
  );
}
```

A Server Component can pass the subtree as children. The region renders a
`display: contents` div; retain a semantic element such as `nav` inside it.
Keep the wrapper in a position where a div is valid HTML.

Ordinary links use the region's router policy and push history. The region
cannot read React Link props from the rendered anchor. For a link with
`replace`, `scroll`, `onNavigate`, `transitionTypes`, or another per-link
requirement, choose a managed `FastLink` or add `data-no-fast-link` to retain
normal Link handling. A descendant pointerdown handler runs too late to
reliably cancel the region's capture listener.

Pass the application's actual `basePath` to `FastLinkRegion` when configured.
For example, with `/docs`, Next Link renders `/docs/overview`; the region removes
one matching prefix before the App Router adds it. Plain anchors inside the
region must include `/docs` in their authored href so native activation reaches
the same destination. `FastLink` uses its authored Link destination and does
not accept a `basePath` prop.

## Managed links and cancellation

```tsx
import { FastLink } from '@fast-link/next';

export function AccountLink() {
  return (
    <FastLink href="/account" replace scroll={false}>
      Account
    </FastLink>
  );
}
```

`FastLink` renders Next Link and retains prefetching. Its early path supports
object `href`, `replace`, `scroll`, `transitionTypes`, and synchronous
`onNavigate` cancellation. Calling the event's `preventDefault()` in
`onNavigate` cancels before policy evaluation, observation, and navigation.
Define callback props in a Client Component.

An `onClick` guard cannot cancel navigation that already started on pointerdown.
Keep links requiring release-time validation opted out. `onFastNavigate` is an
observer, not a cancellation hook: its return value is ignored and navigation
is still attempted if it throws.

A managed anchor takes priority over containing regions, even with
`enabled={false}`. Disabling a containing region does not disable separately
managed links. Nested regions retain outer-first capture ordering.

With `as`, the managed link stays on the normal Link path. With
`legacyBehavior`, no controller is attached to the rendered anchor; add
`data-no-fast-link` to that anchor if a containing region would otherwise
handle it.

## Application-owned renderers

Use the Next.js hook when the application owns rendering, refs, prefetching,
click handlers, or pending state:

```tsx
'use client';

import { useFastLink, type UseFastLinkOptions } from '@fast-link/next';
import Link from 'next/link';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

type AppLinkProps = ComponentPropsWithoutRef<typeof Link> &
  Pick<UseFastLinkOptions, 'enabled'>;

export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(
  function AppLink({ enabled, ...props }, forwardedRef) {
    const attach = useFastLink({ ...props, enabled, forwardedRef });
    return <Link {...props} ref={attach} />;
  },
);
```

Pass the renderer's actual routing props into the hook, and compose the caller's
ref through `forwardedRef`. The hook attaches early navigation only to an
anchor with a supplied `href`, no `as`, and no `legacyBehavior`. It composes refs
for non-anchor roots while keeping their behavior native.

Committed option changes preserve a pending follow-up click. Root replacement
and unmount destroy the controller and clean up composed refs.

## Pending state and application boundaries

Fast Link uses public router calls, which do not set Next Link's internal
`useLinkStatus().pending`. Use route-level loading UI or application-owned
pending state updated by `onFastNavigate`; define how that state completes or
resets in the application.

Read [Routing decisions](routing.md) when the current router does not own every
same-origin destination. Managed links use their own policy, not a containing
region's policy. Bind an application policy to both link and region wrappers
when both need it.

The [package README](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
contains the full public API. Check it against the installed version before
using options not covered here.
