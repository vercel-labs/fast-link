# ▲ @fast-link/next

`@fast-link/next` starts eligible primary-mouse navigation on `pointerdown` in
a Next.js App Router application. It provides components for existing link
regions and individual links, plus a hook for custom renderers.

For press timing and opt-outs, see
[when to use Fast Link](https://github.com/vercel-labs/fast-link#when-to-use-fast-link).

## Requirements

Supports Node.js 22 or later, with Next.js 16 (`>=16 <17`) and React 19 (`>=19 <20`).
Requires the Next.js App Router.

## Install the package

```sh
npm install @fast-link/next
```

## Choose an interface

| Interface        | Use it for                                    |
| ---------------- | --------------------------------------------- |
| `FastLink`       | One App Router link with its own Link options |
| `FastLinkRegion` | Existing links sharing one navigation policy  |
| `useFastLink`    | A custom component that renders the anchor    |

`FastLinkRegion` wraps a group once, so you do not need to replace its links or
manage refs. `FastLink` renders `next/link`, preserving Link prefetching and
native activation.

## Configure one link

Use `FastLink` when one link needs its own Next.js behavior:

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

- Supports [Next Link options](#fastlink), including object `href`.
- Keeps its own options and policy inside a `FastLinkRegion`, even when disabled.

## Add Fast Link to a navigation region

Wrap existing `next/link` or anchor elements that share one navigation policy:

```tsx
import { FastLinkRegion } from '@fast-link/next';
import Link from 'next/link';

export default function Navigation() {
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

- Use `FastLink` for per-link options. It keeps its own options and policy inside
  a region.
- Regions cannot read Next Link options from ordinary rendered anchors.

Primary mouse navigation now starts on `pointerdown`. A Server Component can
pass the link subtree as children.

`FastLinkRegion` renders a `display: contents` `div`. Keep a semantic element,
such as `nav`, inside the region. The wrapper has no layout box.

### Configure a Next.js base path

Match the `basePath` configured in `next.config`:

```tsx
import { FastLinkRegion } from '@fast-link/next';
import Link from 'next/link';

export function DocsNavigation() {
  return (
    <FastLinkRegion basePath="/docs">
      <nav>
        <Link href="/overview">Overview</Link>
      </nav>
    </FastLinkRegion>
  );
}
```

- Next Link renders `/docs/overview`.
- The region passes `/overview` to App Router, which adds `/docs` back.
- Omitting the region's configured base path can produce `/docs/docs/overview`.
- One exact prefix is removed. `/docs` becomes `/`; `/docs-extra` stays unchanged.
- Plain anchors need the base path in their `href` for native navigation.
- No app base path: omit the prop (default `''`).
- `FastLink` uses its authored destination; it has no `basePath` prop.

### Leave one region link on its normal path

Add `data-no-fast-link` when an ordinary link's click-time behavior or Link
options must run:

```tsx
import Link from 'next/link';

export function AccountLink() {
  return (
    <Link href="/account" data-no-fast-link replace scroll={false}>
      Account
    </Link>
  );
}
```

Use this opt-out for an ordinary link with `onNavigate`, an `onClick` guard,
`replace`, `scroll`, or other behavior that the region cannot read from the
rendered anchor. A descendant React `onPointerDownCapture` can stop or prevent
the press before the region's native listener runs. Descendant bubble handlers
run after early navigation and cannot cancel it. Define callback props in a
Client Component.

## Understand navigation and click behavior

- Click-time guards: opt out if they must run before navigation.
- API routes or another application's pages: choose an explicit routing policy
  or opt out. See [application boundaries](#route-links-across-application-boundaries).

For an accepted primary mouse press, a managed link calls Next.js Link's
`onNavigate` prop before selecting navigation. Ordinary region links skip that
callback.

| Condition                                     | Navigation                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------- |
| Managed `onNavigate` calls `preventDefault()` | Cancel early navigation; skip policy and `onFastNavigate`.                   |
| No `navigationPolicy`                         | Use the current App Router.                                                  |
| Policy chooses `{ kind: 'router' }`           | Use Next's destination and history method, with an optional scroll override. |
| Policy chooses `{ kind: 'document', method }` | Load the validated URL using document `assign` or `replace`.                 |

- For uncanceled navigation, `onFastNavigate(intent, decision)` observes the
  selected decision before navigation is attempted.
- Policy cannot cancel navigation or rewrite the router destination or history
  method.
- The matching follow-up pointer click is default-prevented, even after managed
  `onNavigate` cancellation. It cannot trigger default navigation but still
  propagates to mounted link and ancestor handlers.
- A route may unmount handlers before release. Dragging away may navigate
  without producing a click.
- An `onPointerDown` bubble guard runs after early navigation. Use synchronous
  `onNavigate` cancellation for press-time validation; opt out for release-time
  validation.

Fast Link leaves these interactions on their normal Link or browser path:

- Touch and pen input
- Keyboard, middle, right, and modified clicks
- Downloads, external URLs, non-`_self` targets, and hash-only links
- Presses that start on nested controls
- Anchors or descendants with `data-no-fast-link`
- Components with `enabled={false}`

Other integration rules:

- Keyboard and touch activation skip `navigationPolicy`; preserve the
  application's normal routing for those inputs.
- With `as` or `legacyBehavior`, `FastLink` stays on the normal Link path.
  Legacy behavior attaches no controller to the anchor; add `data-no-fast-link`
  when that anchor needs native handling inside a region.
- Committed option updates preserve pending click suppression. Removing or
  replacing the root destroys the old controller and clears pending suppression.

### Pending state

- `useLinkStatus().pending` does not update. Public App Router calls cannot set
  Next Link's pending state.
- Use route-level loading UI, or manage pending state in your app.
- Start app-owned state in `onFastNavigate`. It reports an attempt, not completion.
- Clear it on completion. Reset it on failure, cancellation, and unmount.

## API reference

### Options shared by links, regions, and hooks

| Option             | Type                         | Default | Behavior                                               |
| ------------------ | ---------------------------- | ------- | ------------------------------------------------------ |
| `enabled`          | `boolean`                    | `true`  | Controls whether new pointerdowns can start navigation |
| `navigationPolicy` | `FastNavigationPolicy`       | None    | Selects App Router or document navigation              |
| `onFastNavigate`   | `(intent, decision) => void` | None    | Observes the frozen decision before navigation         |

`onFastNavigate` cannot change the selected action. Its return value is ignored,
and navigation is still attempted if it throws.

### `FastLink`

`FastLinkProps` includes every prop accepted by `next/link` plus the shared
options above. `href` remains required.

Fast navigation preserves `replace`, `scroll`, and `transitionTypes` options.
`transitionTypes` follows the installed `next/link` types; it is omitted from
hook options on Next versions that do not declare it.
`onNavigate` can cancel Fast Link before policy evaluation, observation, or
navigation.

### `FastLinkRegion`

| Prop               | Type                         | Default  | Behavior                                                   |
| ------------------ | ---------------------------- | -------- | ---------------------------------------------------------- |
| `children`         | `ReactNode`                  | Required | Supplies the existing link subtree                         |
| `basePath`         | `string`                     | `''`     | Removes one matching prefix before `router.push`           |
| `enabled`          | `boolean`                    | `true`   | Controls early navigation for ordinary links in the region |
| `navigationPolicy` | `FastNavigationPolicy`       | None     | Selects App Router or document navigation                  |
| `onFastNavigate`   | `(intent, decision) => void` | None     | Observes the selected decision before navigation           |

Nested regions retain outer-first capture ordering. A managed `FastLink` or
`useFastLink` anchor owns its press before every containing region.

### `useFastLink`

`useFastLink(options)` returns stable `{ ref, onClickCapture }` bindings for an
application-owned anchor or optional-href element. Spread both on the same DOM
element after other props. It accepts:

- `href`, `as`, `legacyBehavior`, `replace`, `scroll`, `onNavigate`, and
  `transitionTypes` from `next/link`
- The shared `enabled`, `navigationPolicy`, and `onFastNavigate` options
- `forwardedRef` for composing the caller's ref
- `onClickCapture`, called after suppression even when the click is prevented

A missing `href`, a supplied `as`, `legacyBehavior={true}`, or a non-anchor root
leaves navigation on its normal path. Option updates preserve a pending
follow-up click. Replacing the root or unmounting destroys the controller and
cleans up composed refs.

### Navigation policy types

`FastNavigationPolicy(intent, proposed)` runs synchronously and returns a
`FastNavigationDecision`. `FastRouterProposal` describes the route the adapter
would take without policy:

| Proposal field | Type                   | Value                               |
| -------------- | ---------------------- | ----------------------------------- |
| `destination`  | `string`               | The computed App Router destination |
| `method`       | `'push' \| 'replace'`  | The proposed history method         |
| `scroll`       | `boolean \| undefined` | The proposed scroll behavior        |

| Decision                                  | Action                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| `{ kind: 'router' }`                      | Use the proposed route and scroll behavior                   |
| `{ kind: 'router', scroll: false }`       | Use the proposed route and preserve scroll position          |
| `{ kind: 'document', method: 'assign' }`  | Load the validated URL with a new history entry              |
| `{ kind: 'document', method: 'replace' }` | Load the validated URL and replace the current history entry |

A policy can override only router scroll behavior. It cannot replace the
destination, history method, or transition settings.

## Route links across application boundaries

Supply a policy when the current App Router does not own every same-origin
destination. Bind the policy once in reusable Client Component wrappers:

`navigationPolicy` handles accepted early mouse navigation. Preserve the
application's normal routing across application boundaries for keyboard and
touch activation too.

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

const ownedPaths = new Set(['/overview', '/pricing']);

const navigationPolicy: FastNavigationPolicy = (intent, proposed) => {
  const route = new URL(proposed.destination, intent.url);
  return ownedPaths.has(route.pathname)
    ? { kind: 'router' }
    : { kind: 'document', method: 'assign' };
};

export const AppLink = forwardRef<
  HTMLAnchorElement,
  Omit<FastLinkProps, 'navigationPolicy'>
>(function AppLink(props, ref) {
  return <FastLink {...props} ref={ref} navigationPolicy={navigationPolicy} />;
});

export function AppRegion(
  props: Omit<FastLinkRegionProps, 'navigationPolicy'>,
) {
  return <FastLinkRegion {...props} navigationPolicy={navigationPolicy} />;
}
```

Both wrappers use the same navigation policy. `AppLink` forwards the caller's ref
and Link options. `AppRegion` forwards region props, including `basePath`,
`enabled`, and `onFastNavigate`.

Fast Link does not infer ownership from paths or metadata. Classify foreign or
unknown ownership as document navigation. An ordinary link inside `AppRegion`
uses the region policy, while `AppLink` uses its own policy and Link options.

Link `onNavigate` runs before the policy. Cancellation skips policy, observation,
and navigation. A link that needs a click-time guard must opt out before
`pointerdown`; a policy cannot return control to the original click.

A throwing policy or invalid decision attempts document assign to the captured
URL, then surfaces the policy error. Extra decision properties are ignored.
Observer errors still permit navigation. Router errors surface without a document
fallback. If navigation also throws after a policy or observer error, the
navigation error takes precedence.

## Build a custom renderer

Prefer `FastLink` for reusable wrappers that forward refs and Link props. Use
`useFastLink` when an existing renderer must control the anchor, prefetching,
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
    const attach = useFastLink({
      ...props,
      enabled,
      forwardedRef,
    });

    return <Link {...props} {...attach} />;
  },
);
```

The renderer must forward both bindings to its anchor or fallback element.
Pass its capture handler into the hook and spread the bindings last so it runs
after suppression. The renderer keeps its normal Link props and forwarded ref.
Add `onFastNavigate` to maintain application pending state when route-level
loading UI is not enough.

## Exports

`@fast-link/next` exports `FastLink`, `FastLinkRegion`, `useFastLink`,
`FastLinkProps`, `FastLinkRegionProps`, `UseFastLinkOptions`,
`FastRouterProposal`, `FastNavigationPolicy`, `FastNavigationDecision`, and
`FastLinkIntent`.
