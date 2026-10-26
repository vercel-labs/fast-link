# Next.js App Router integration

Read this for Fast Link work in a Next.js application, before selecting an
integration or imports. Verify the target uses App Router and that its Next.js
and React versions satisfy the installed package's peer range. Pages Router
is outside `@fast-link/next`'s support; retain its existing navigation while
establishing a supported integration.

Import public exports from `@fast-link/next`; Fast Link does not need private
Next.js modules.

## Select the integration first

Apply the skill's early-navigation safety gate to each option below. An adapter
does not make a release-time guard safe to move to pointerdown.

1. **Reuse an applicable Fast Link integration.** Follow the target's aliases,
   barrels, shared packages, and usages. Verify its routing and rendering
   contracts match this application, then use that application entry point.
   If an option is missing, inspect extending the existing integration within
   scope before creating a parallel wrapper or bypassing it.
2. **If none exists, inspect the current link boundary and routing.** For direct
   `next/link` usage with straightforward routing and no additional application
   behavior, use public `@fast-link/next` components directly. A direct import
   alone does not prove simplicity: check routing configuration and handlers.
3. **Preserve custom link boundaries.** For an application or shared-library
   Link, retain its consumer contract and integrate at that boundary. Inspect
   supported composition or adapt the owned implementation with Fast Link
   components. A styling-only Link can remain unchanged inside a region after
   verifying its rendering, handlers, per-link options, and routing are compatible.
   A custom import alone requires neither a policy nor a hook.
4. **Bind required application behavior.** When route ownership or other required
   navigation behavior exists, reuse its resolver and verified inputs in the
   application integration, even if current consumers import `next/link` directly.
   Read [Routing decisions](routing.md) for policy contracts. Keep uncertain
   links native when source or documented contracts cannot establish safe behavior.

Within the selected integration, use managed `FastLink` for per-link options
and synchronous cancellation, or a region for ordinary links sharing one
navigation policy. Choose the narrowest compatible region. Use supported component
composition before the [custom-renderer hook](#custom-renderers), which requires
a demonstrated renderer constraint. Keep one anchor per link.

The direct imports below illustrate simple routing or implementation inside an
application adapter. Consumers reuse the application entry point when one applies.

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

`FastLinkRegion` leaves prefetching to its child links. Each Next Link keeps
its native prefetch behavior and its own `prefetch` setting.

Ordinary links use the region's router policy and push history. The region
cannot read React Link props from the rendered anchor. For a link with
`replace`, `scroll`, `onNavigate`, `transitionTypes`, or another per-link navigation
requirement, choose a managed `FastLink` or add `data-no-fast-link` to retain
normal Link handling. A descendant React `onPointerDownCapture` can stop or
prevent the press before the region's native listener runs. Descendant bubble
handlers run after early navigation and cannot cancel it.

For apps with a Next.js base path:

- Pass the configured value to `FastLinkRegion`, e.g. `basePath="/docs"`.
- The region strips one matching prefix before App Router adds it.
  Omitting the prop can produce `/docs/docs/overview`.
- Plain anchors need `/docs` in their authored href for native activation.
- `FastLink` uses its authored Link destination; it has no `basePath` prop.

Without a base path, omit the prop (default `''`).

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

`FastLink` renders Next Link and inherits its native prefetch behavior,
including the `prefetch` setting. Its early path supports object `href`,
`replace`, `scroll`, `transitionTypes`, and synchronous
`onNavigate` cancellation. Calling the event's `preventDefault()` in
`onNavigate` cancels before policy evaluation, observation, and navigation.
Define callback props in a Client Component.

An `onPointerDown` bubble guard or `onClick` guard cannot cancel navigation that
already started on pointerdown. For a managed link, use synchronous `onNavigate`
cancellation when validation belongs on press. Keep links requiring release-time
validation opted out. `onFastNavigate` is an observer: its return value is ignored
and navigation is still attempted if it throws. See the
[callback and error contract](https://github.com/vercel-labs/fast-link/tree/main/packages/next#route-links-across-application-boundaries)
for full failure ordering.

A managed anchor takes priority over containing regions, even with
`enabled={false}`. Disabling a containing region does not disable separately
managed links. Nested regions retain outer-first capture ordering.

With `as`, the managed link stays on the normal Link path. With
`legacyBehavior`, no controller is attached to the rendered anchor; add
`data-no-fast-link` to that anchor if a containing region would otherwise
handle it.

## Application-owned links and regions

Use this pattern when verified application behavior or route ownership requires
an adapter. Extend an existing link boundary when present. Simple Next Link
consumers can use the direct imports above without introducing wrappers or
policies. Bind a needed policy inside a Client Component so Server Components
can use the adapter with serializable props and children.

The example assumes a client-safe `ownsRoute(url: URL): boolean` resolver:

- Input: full deployed URL, including any base path.
- Foreign or unknown ownership: `false`.
- If the actual resolver expects a router-relative path, use the appropriate
  `proposed.destination`; configured regions strip their base path there.

Verify the resolver's contract; see [resolver inputs](routing.md#establish-router-ownership).

This example binds the policy for early mouse navigation. Preserve the
application's existing routing for native activation, including keyboard and
touch; the policy does not replace that behavior.

```tsx
'use client';

import {
  FastLink,
  FastLinkRegion,
  type FastLinkProps,
  type FastLinkRegionProps,
  type FastNavigationPolicy,
} from '@fast-link/next';
import { forwardRef } from 'react';

import { ownsRoute } from './route-ownership';

const navigationPolicy: FastNavigationPolicy = (intent, proposed) =>
  ownsRoute(intent.url)
    ? { kind: 'router' }
    : {
        kind: 'document',
        method: proposed.method === 'replace' ? 'replace' : 'assign',
      };

export const AppLink = forwardRef<
  HTMLAnchorElement,
  Omit<FastLinkProps, 'navigationPolicy'>
>(function AppLink(props, ref) {
  return <FastLink {...props} ref={ref} navigationPolicy={navigationPolicy} />;
});

export function AppLinkRegion(
  props: Omit<FastLinkRegionProps, 'navigationPolicy'>,
) {
  return <FastLinkRegion {...props} navigationPolicy={navigationPolicy} />;
}
```

The example shows both exports; implement only those the application needs.
`AppLink` preserves Link props and the caller's ref. `AppLinkRegion` forwards
region options, including the application's `basePath` when supplied. Bind the
policy to each integration that needs it: a managed link does not inherit its
containing region's policy.

When native activation needs a document fallback, keep or add that handling in
the component adapter's `onClick`. Run the caller's handler first and honor
`event.defaultPrevented` before routing, so an accepted early press does not
navigate again on release. Preserve the application's rules for keyboard,
modified clicks, downloads, and targets. Verify those native paths separately.

Use `navigationPolicy` to select early router or document navigation, rather
than canceling in `onNavigate` and navigating as a side effect. `onNavigate`
runs on both early and native Link navigation. A native fallback alone does
not require a custom renderer or `useFastLink`.

## Custom renderers

Use `useFastLink` as the last option when neither a region nor a `FastLink`
wrapper fits. For example, an existing design-system renderer may need per-link
navigation options that a region cannot honor, while providing no way to render
through `FastLink`. Polymorphic output alone does not require the hook when its
anchor branch can render `FastLink`; the hook fits when the existing renderer
must own that root. Verify the actual rendering and ref contracts first.

Custom styles, refs, prefetch settings, handlers, and application-owned pending
UI alone do not require the hook; use the component props and wrappers when
they meet those needs. The hook does not restore Next Link's internal pending
state or make click-time guards safe for early navigation.

The example below assumes an existing `AppLinkRenderer` that accepts Next Link
props, forwards its ref to an anchor, and must retain its rendering behavior:

```tsx
'use client';

import { useFastLink, type UseFastLinkOptions } from '@fast-link/next';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { AppLinkRenderer } from './app-link-renderer';

type CustomLinkProps = ComponentPropsWithoutRef<typeof AppLinkRenderer> &
  Pick<UseFastLinkOptions, 'enabled' | 'navigationPolicy' | 'onFastNavigate'>;

export const CustomLink = forwardRef<HTMLAnchorElement, CustomLinkProps>(
  function CustomLink(
    { enabled, navigationPolicy, onFastNavigate, ...props },
    forwardedRef,
  ) {
    const attach = useFastLink({
      ...props,
      enabled,
      navigationPolicy,
      onFastNavigate,
      forwardedRef,
    });
    return <AppLinkRenderer {...props} {...attach} />;
  },
);
```

Pass the renderer's actual routing and capture props into the hook, and compose
the caller's ref through `forwardedRef`. Verify that the renderer forwards both
`ref` and `onClickCapture` to the same DOM element. Spread the bindings last to
retain handler composition. The hook attaches early navigation only to an
anchor with a supplied `href`, no `as`, and no `legacyBehavior`. It composes refs
for non-anchor roots while keeping their behavior native.

Committed option changes preserve a pending follow-up click. Root replacement
and unmount destroy the controller and clean up composed refs.

## Pending state

Fast Link uses public router calls, which do not set Next Link's internal
`useLinkStatus().pending`. Use route-level loading UI or application-owned
pending state updated by `onFastNavigate`; define how that state completes or
resets in the application.

The [package README](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
contains the full public API. Check it against the installed version before
using options not covered here.
