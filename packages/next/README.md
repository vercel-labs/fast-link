# ▲ @fast-link/next

`FastLink`, `FastLinkRegion`, and `useFastLink` prepare eligible mouse navigation
on press and navigate only at accepted click. `FastLink` accepts after Next Link's
guards; regions and custom hooks accept during click capture.

For press timing and opt-outs, see
[when to use Fast Link](https://github.com/vercel-labs/fast-link#when-to-use-fast-link).

[Install](#install-the-package) · [Choose an interface](#choose-an-interface) ·
[One link](#configure-one-link) · [Regions and base paths](#add-fast-link-to-a-navigation-region) ·
[Navigation and pending state](#understand-navigation-and-click-behavior) ·
[Routing policies](#route-links-across-application-boundaries) ·
[Custom renderers](#build-a-custom-renderer) · [API reference](#api-reference)

See the [runtime limitations](https://github.com/vercel-labs/fast-link#known-limitations).

## Requirements

Supports Node.js 22 or later, with stable Next.js 16, the exact prerelease
`16.5.0-canary.37`, and React 19 (`>=19 <20`).
Requires the Next.js App Router.

Early preparation requires Next `16.5.0-canary.37` with
`experimental: { prepareNavigation: true }` in `next.config`. It uses the
public optional `router.experimental_prepare` API. Without that API, or if
preparation throws, all three integrations execute the normal router/document decision
at accepted click. A failed commit is never retried.

Preparation is experimental. Discarding a handle does not abort Next's request,
and this runtime does not establish correct Chrome soft-navigation attribution.

## Install the package

```sh
npm install @fast-link/next
```

The [Fast Link agent skill](https://github.com/vercel-labs/fast-link#agent-skill)
is included at `skills/fast-link/SKILL.md`.

## Choose an interface

| Interface        | Use it for                                    |
| ---------------- | --------------------------------------------- |
| `FastLink`       | One App Router link with its own Link options |
| `FastLinkRegion` | Existing links sharing one navigation policy  |
| `useFastLink`    | A custom component that renders the anchor    |

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
- Runs caller `onClick` and `onNavigate` guards before navigation.
- Preserves Next Link prefetching and native activation.
- Keeps its own options and policy inside a `FastLinkRegion`, even when disabled.

## Add Fast Link to a navigation region

Wrap existing `next/link` or anchor elements that share one navigation policy:

Regions prepare on press and accept navigation during click capture. Use
`FastLink` when child click guards must run before acceptance.

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

- Server Components can pass the link subtree as children.
- The wrapper is a `display: contents` div, with no layout box.
  Keep a semantic element such as `nav` inside it.

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

- Opt out for click-time guards or Link options the region cannot read.
- Regions accept during click capture. Later child handlers cannot veto that
  navigation; use `FastLink` when they must run first.
- Define callbacks in a Client Component.

## Understand navigation and click behavior

- `FastLink` honors its `onClick` and `onNavigate` guards. Regions accept during
  click capture. The custom hook runs its supplied `onClickCapture` and
  `onNavigate` guards before capture acceptance. Later child guards cannot veto
  a committed route; use `FastLink` or opt out when they must run first.
- API routes or another application's pages: choose an explicit routing policy
  or opt out. See [application boundaries](#route-links-across-application-boundaries).

For all three integrations, press classifies ownership and prepares router-owned routes
without changing URL, history, or route UI. `FastLink` click runs caller `onClick`, Next's
native checks, and caller `onNavigate`, then rechecks current policy/options and
consumes matching preparation once. A changed destination or router discards
handle reuse. Current policy, history, scroll, and transition options apply at
click; callback identity alone does not invalidate preparation.

| Condition                                                  | Navigation                                                                                                     |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Managed `onClick` or `onNavigate` calls `preventDefault()` | Cancel navigation; skip click-time policy and observation. A press-time policy call may already have occurred. |
| No `navigationPolicy`                                      | Use the current App Router.                                                                                    |
| Policy chooses `{ kind: 'router' }`                        | Use Next's destination and history method, with an optional scroll override.                                   |
| Policy chooses `{ kind: 'document', method }`              | Load the validated URL using document `assign` or `replace`.                                                   |

- For uncanceled navigation, `onFastNavigate(intent, decision)` observes the
  selected decision before navigation is attempted.
- Policy cannot cancel navigation or rewrite the router destination or history
  method.
- All three integrations discard preparation on release away, drag, cancellation, root
  replacement, or unmount. A click stopped before Next Link's handler retains
  browser default behavior unless the stopping handler also prevents default.

Native behavior remains for:

- Touch, pen, keyboard, modified and non-primary clicks.
- Downloads, external or hash-only URLs, non-`_self` targets, nested controls,
  and `data-no-fast-link` opt-outs.

See core's [eligibility rules](https://github.com/vercel-labs/fast-link/tree/main/packages/core#know-which-interactions-fast-link-accepts).
Use `enabled={false}` to disable a component's early navigation.

Other integration rules:

- Keyboard and touch activation skip `navigationPolicy`; preserve the
  application's normal routing for those inputs.
- `as` and `legacyBehavior` are not supported props. Custom renderers must expose
  an anchor ref and supply `href`.
- Committed updates preserve valid preparation. Removing or replacing the root
  destroys the old controller.

### Pending state

- `useLinkStatus().pending` does not update. Public App Router calls cannot set
  Next Link's pending state.
- Use route-level loading UI, or manage pending state in your app.
- Start app-owned state in `onFastNavigate`. It reports an attempt, not completion.
- Clear it on completion. Reset it on failure, cancellation, and unmount.

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

Policies must be synchronous and side-effect-free. All Next integrations classify once
on eligible press when preparation is available and again after accepted-click
guards. Read current metadata on each call. Move analytics, state updates, and
other effects to `onNavigate` or `onFastNavigate`. The latter runs once per
accepted navigation attempt.

A preparation-time error cannot navigate. At accepted navigation, a throwing
policy or invalid decision attempts document assign to the captured
URL, then surfaces the policy error. Extra decision properties are ignored.
Observer errors still permit navigation. Router errors surface without a document
fallback. If navigation also throws after a policy or observer error, the
navigation error takes precedence.

## Build a custom renderer

Prefer `FastLink` for reusable wrappers that forward refs and Link props. Use
`useFastLink` when an existing renderer must control the anchor, prefetching,
click handlers, or pending state:

The hook prepares on press. At click capture it runs the supplied
`onClickCapture` and `onNavigate` guards, then navigates if accepted. Later
child guards cannot cancel that navigation.

```tsx
'use client';

import { useFastLink, type UseFastLinkOptions } from '@fast-link/next';
import Link from 'next/link';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

type AppLinkProps = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  'as' | 'legacyBehavior'
> &
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

The renderer must forward both bindings to its anchor. Pass its capture handler
into the hook and spread the bindings last so that handler runs before acceptance.
The renderer must honor `defaultPrevented` and retain its native activation path.
Add `onFastNavigate` to maintain application pending state when route-level
loading UI is not enough.

## API reference

### Options shared by links, regions, and hooks

| Option             | Type                         | Default | Behavior                                                 |
| ------------------ | ---------------------------- | ------- | -------------------------------------------------------- |
| `enabled`          | `boolean`                    | `true`  | Controls preparation and accepted-click navigation       |
| `navigationPolicy` | `FastNavigationPolicy`       | None    | Pure classification of App Router or document navigation |
| `onFastNavigate`   | `(intent, decision) => void` | None    | Observes the frozen decision before navigation           |

`onFastNavigate` cannot change the selected action. Its return value is ignored,
and navigation is still attempted if it throws.

### `FastLink`

`FastLinkProps` includes `next/link` props except `as` and `legacyBehavior`,
plus the shared options above. `href` is required.

Fast navigation preserves `replace`, `scroll`, and `transitionTypes` options.
`transitionTypes` follows the installed `next/link` types; it is omitted from
hook options on Next versions that do not declare it.
`onNavigate` can cancel before click-time policy, observation, or navigation;
preparation-time classification may already have run.

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
application-owned anchor. Spread both on that anchor after other props. It accepts:

- Required `href`, plus `replace`, `scroll`, `onNavigate`, and version-supported
  `transitionTypes` from `next/link`.
- The shared `enabled`, `navigationPolicy`, and `onFastNavigate` options.
- `forwardedRef` for composing an anchor ref.
- `onClickCapture`, which runs before acceptance and can cancel with `preventDefault()`.

The supplied `onNavigate` guard runs after `onClickCapture` for matching clicks.
The renderer owns native activation, prefetching, and pending UI. It must honor
`defaultPrevented` so a capture-accepted click does not navigate twice.

Committed option changes preserve valid preparation. Replacing the root or
unmounting destroys the controller and cleans up composed refs.

### Navigation policy types

`FastNavigationPolicy(intent, proposed)` runs synchronously without side effects and returns a
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

### Exports

`@fast-link/next` exports `FastLink`, `FastLinkRegion`, `useFastLink`,
`FastLinkProps`, `FastLinkRegionProps`, `UseFastLinkOptions`,
`FastRouterProposal`, `FastNavigationPolicy`, `FastNavigationDecision`, and
`FastLinkIntent`.
