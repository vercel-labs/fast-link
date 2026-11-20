# ▲ @fast-link/next

`FastLink`, `FastLinkRegion`, and `useFastLink` add mode-aware mouse
navigation to App Router. In the default release mode they start preparing
right after press and navigate on the accepted click. Preparation needs a supported Next runtime
(see [Requirements](#requirements)); on other versions release mode routes at
the accepted click. `FastLink` runs your `onClick` and `onNavigate` handlers
before navigating. Regions and custom hooks
[accept during click capture](#leave-one-region-link-on-its-normal-path).

For press timing and opt-outs, see
[when to use Fast Link](https://github.com/vercel-labs/fast-link#when-to-use-fast-link).

[Install](#install-the-package) · [Choose an interface](#choose-an-interface) ·
[Modes](#choose-a-navigation-mode) ·
[One link](#configure-one-link) · [Regions and base paths](#add-fast-link-to-a-navigation-region) ·
[Navigation and pending state](#understand-navigation-and-click-behavior) ·
[Routing policies](#route-links-across-application-boundaries) ·
[Custom renderers](#build-a-custom-renderer) · [API reference](#api-reference)

See the [runtime limitations](https://github.com/vercel-labs/fast-link#known-limitations).

## Requirements

Supports Node.js 22 or later, with stable Next.js 16, Next `16.5.0-canary.42`
or a later 16.5.0 canary, and React 19 (`>=19 <20`).
Requires the Next.js App Router.

Early preparation requires Next `16.5.0-canary.42` or a later 16.5.0 canary
with `experimental: { prepareNavigation: true }` in `next.config`. It uses the
public optional `router.experimental_prepare` API. Without that API, or if
preparation throws, all three integrations route at the accepted click and apply
the navigation policy as usual. If router navigation throws, Fast Link doesn't
retry it. Immediate mode never prepares.

Preparation is experimental. Releasing away discards Fast Link's prepared
navigation but doesn't abort the route request Next already started.

### Soft-navigation reporting in Chrome

Chrome 157 doesn't report a soft navigation for a release-mode click when the
prepared request is still pending at click, for example when the destination
is slow. Monitoring tools that rely on soft navigations can then attribute
later CLS and INP to the previous page. Chrome didn't report immediate-mode
navigations as soft navigations in any tested case.

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

## Choose a navigation mode

Every interface accepts `mode`:

| Mode                | Behavior                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `release` (default) | Prepare after mouse press; navigate on the accepted click. Releasing away cancels.         |
| `immediate`         | Navigate on mouse press, before release. Releasing away or a later click cannot cancel it. |
| `native`            | Leave navigation to Next Link or the renderer, including client routing. No forced reload. |

```tsx
<FastLink href="/pricing">Prepare after press, navigate on click</FastLink>
<FastLink href="/pricing" mode="immediate">Navigate on press</FastLink>
<FastLink href="/pricing" mode="native">Ordinary Next Link behavior</FastLink>
```

Both accelerated modes leave touch, pen, keyboard, and modified input native.
Sites requiring WCAG Level A or AA conformance should not use immediate mode.
Release mode keeps release-time cancellation, but opting in doesn't by itself
establish conformance.

In immediate mode, `onNavigate` runs on press, before policy and navigation,
and can cancel it with `preventDefault()`. Click handlers cannot: the
follow-up click is default-prevented, even when `onNavigate` cancels or
throws, and still propagates. Regions have no press guard; opt a link out with
`data-no-fast-link` when it needs one.

Avoid capture-phase `stopPropagation()` on clicks above immediate links. It
stops the follow-up click before Fast Link can prevent it, including from a
React ancestor's `onClickCapture`, because the App Router hydrates on
`document`. If the source link is still mounted at release, the click then
also performs a document navigation.

Changing `mode` keeps the element and does not remount the link. Leaving
release mode while a button is held discards preparation; the later click uses
ordinary routing. A click owed suppression by an earlier immediate press stays
suppressed in every mode.

### Migrate from `enabled`

`mode` replaces `enabled`. Earlier versions navigated on press; to keep that
timing, use `mode="immediate"`. Omitting `mode` now selects release.

| Before               | After                                          |
| -------------------- | ---------------------------------------------- |
| `enabled={false}`    | `mode="native"`                                |
| `enabled={isFast}`   | `mode={isFast ? 'immediate' : 'native'}`       |
| `enabled` or omitted | `mode="immediate"`, or omit `mode` for release |

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
- In release mode, runs caller `onClick` and `onNavigate` guards before
  navigation.
- Preserves Next Link prefetching and native activation.
- Keeps its own mode, options, and policy inside every `FastLinkRegion`,
  including in native mode. A `FastLink` without `mode` uses release even
  inside an immediate region.

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

In release mode, regions prepare after press and
[accept during click capture](#leave-one-region-link-on-its-normal-path).

- Use `FastLink` for per-link options. It keeps its own options and policy inside
  a region.
- Regions cannot read Next Link options from ordinary rendered anchors.
- An ordinary link uses its closest region's mode and policy, including a
  native region. An accelerated inner region works inside a native one.
  Regions bound with core `createLinkInteraction` or React
  `useLinkInteraction` follow the same rule.
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
- In release mode, regions and `useFastLink` accept during click capture, after
  their supplied guards. Later child handlers cannot veto that navigation; use
  `FastLink` when they must run first.
- Define callbacks in a Client Component.

## Understand navigation and click behavior

- API routes or another application's pages: choose an explicit routing policy
  or opt out. See [application boundaries](#route-links-across-application-boundaries).

The rest of this section describes release mode. When preparation is
available, Fast Link checks the navigation policy in the task after an eligible
mouse press. If it chooses App Router navigation, Fast Link prepares the
destination without changing the URL, history, or page content. A click
accepted before that task routes without preparation.

On click, `FastLink` runs your `onClick`, Next Link's checks, and your `onNavigate`.
Either callback can cancel navigation.

Navigation uses the latest policy, history, scroll, and transition options.
Fast Link reuses preparation only when the router and destination still match.
Changing a callback alone does not discard preparation.

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
Use `mode="native"` to keep normal link behavior.

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

`navigationPolicy` handles accepted early mouse navigation. Preserve the
application's normal routing across application boundaries for keyboard and
touch activation too.

Both wrappers use the same navigation policy. `AppLink` forwards the caller's ref
and Link options. `AppRegion` forwards region props, including `basePath`,
`mode`, and `onFastNavigate`.

Fast Link does not infer ownership from paths or metadata. Classify foreign or
unknown ownership as document navigation. An ordinary link inside `AppRegion`
uses the region policy, while `AppLink` uses its own policy and Link options.

Policies must be synchronous and side-effect-free, and must read current
metadata on each call:

- Release calls the policy in the task after an eligible press when preparation
  is available and the click has not been accepted yet, and again after
  accepted-click guards.
- Immediate calls it once on press, after `onNavigate`.
- Native never calls it.

Move analytics, state updates, and other effects to `onNavigate` or
`onFastNavigate`, which runs once per accepted navigation attempt.

### Failure behavior

| Failure                                                                    | Behavior                                                                 |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Preparation throws (release mode)                                          | Navigation still waits for the click.                                    |
| `navigationPolicy` throws or returns an invalid decision during navigation | Attempt `location.assign()` with the captured URL, then throw the error. |
| `onFastNavigate` throws                                                    | Still attempt navigation, then throw the error.                          |
| Router navigation throws                                                   | Throw the error without retrying through document navigation.            |

If navigation also throws, its error takes precedence. Extra decision properties
are ignored.

## Build a custom renderer

Prefer `FastLink` for reusable wrappers that forward refs and Link props. Use
`useFastLink` when an existing renderer must control the anchor, prefetching,
click handlers, or pending state:

```tsx
'use client';

import { useFastLink, type UseFastLinkOptions } from '@fast-link/next';
import Link from 'next/link';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

type AppLinkProps = Omit<
  ComponentPropsWithoutRef<typeof Link>,
  'as' | 'legacyBehavior'
> &
  Pick<UseFastLinkOptions, 'mode'>;

export const AppLink = forwardRef<HTMLAnchorElement, AppLinkProps>(
  function AppLink({ mode, ...props }, forwardedRef) {
    const attach = useFastLink({
      ...props,
      mode,
      forwardedRef,
    });

    return <Link {...props} {...attach} />;
  },
);
```

In release mode the hook prepares after press and
[accepts during click capture](#leave-one-region-link-on-its-normal-path) after the supplied `onClickCapture` and
`onNavigate` guards. If a guard changes the mode, or the anchor's ownership or
attachment changes before acceptance, the hook leaves the click to the
renderer, which runs its own guards again. In immediate mode the hook runs
`onNavigate` and navigates on press; `onClickCapture` then sees the prevented
follow-up click.

The renderer must forward both bindings to its anchor. Pass its capture handler
into the hook and spread the bindings last so that handler runs before acceptance.
The renderer must honor `defaultPrevented` and retain its native activation path.
Add `onFastNavigate` to maintain application pending state when route-level
loading UI is not enough.

## API reference

### Options shared by links, regions, and hooks

| Option             | Type                         | Default     | Behavior                                                 |
| ------------------ | ---------------------------- | ----------- | -------------------------------------------------------- |
| `mode`             | `LinkMode`                   | `'release'` | `'release'`, `'immediate'`, or `'native'`                |
| `navigationPolicy` | `FastNavigationPolicy`       | None        | Pure classification of App Router or document navigation |
| `onFastNavigate`   | `(intent, decision) => void` | None        | Observes the frozen decision before navigation           |

`onFastNavigate` cannot change the selected action. Its return value is ignored,
and navigation is still attempted if it throws.

### `FastLink`

`FastLinkProps` includes `next/link` props except `as` and `legacyBehavior`,
plus the shared options above. `href` is required.

Fast navigation preserves `replace`, `scroll`, and `transitionTypes` options.
`transitionTypes` follows the installed `next/link` types; it is omitted from
hook options on Next versions that do not declare it.
`onNavigate` can cancel before click-time policy, observation, or navigation;
preparation-time classification may already have run. In immediate mode it
runs on press instead.

### `FastLinkRegion`

| Prop               | Type                         | Default     | Behavior                                          |
| ------------------ | ---------------------------- | ----------- | ------------------------------------------------- |
| `children`         | `ReactNode`                  | Required    | Supplies the existing link subtree                |
| `basePath`         | `string`                     | `''`        | Removes one matching prefix before `router.push`  |
| `mode`             | `LinkMode`                   | `'release'` | Selects the mode for ordinary links in the region |
| `navigationPolicy` | `FastNavigationPolicy`       | None        | Selects App Router or document navigation         |
| `onFastNavigate`   | `(intent, decision) => void` | None        | Observes the selected decision before navigation  |

An ordinary link uses its closest region. A managed `FastLink` or `useFastLink`
anchor owns its press before every containing region, in every mode.

### `useFastLink`

`useFastLink(options)` returns stable `{ ref, onClickCapture }` bindings for an
application-owned anchor. Spread both on that anchor after other props. It accepts:

- Required `href`, plus `replace`, `scroll`, `onNavigate`, and version-supported
  `transitionTypes` from `next/link`.
- The shared `mode`, `navigationPolicy`, and `onFastNavigate` options.
- `forwardedRef` for composing an anchor ref.
- `onClickCapture`, which runs before acceptance and can cancel with `preventDefault()`.

In release mode, the supplied `onNavigate` guard runs after `onClickCapture`
for matching clicks.
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
`FastRouterProposal`, `FastNavigationPolicy`, `FastNavigationDecision`,
`FastLinkIntent`, and `LinkMode`.
