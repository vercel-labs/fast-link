# ▲ Fast Link

Fast Link starts work for eligible same-origin links when you press the mouse.
Navigation waits for accepted click. Next.js `FastLink` preserves click guards;
regions and custom hooks accept during click capture.

Keep optimizing page speed and using prefetching. Fast Link doesn't fix slow
pages; it starts work earlier.

## When to use Fast Link

Use Fast Link for ordinary links between pages in your app, such as
documentation, product pages, dashboard views, and links to form pages.

Keep ordinary click behavior for:

- Links that perform actions, such as submitting a form, placing an order, signing
  out, or deleting something.
- Ordinary region links whose later click handlers must veto navigation.
  Use `FastLink` to preserve synchronous `onClick` and `onNavigate` cancellation.
- Links that open or toggle UI, such as a modal, menu, or tab.
- Downloads and links that require native URL dragging.

Use `enabled={false}` or `data-no-fast-link` to opt out of early navigation.

See [Known limitations](#known-limitations) for press timing and accessibility details.

## Choose a package

| Package                                 | Use it for                                      |
| --------------------------------------- | ----------------------------------------------- |
| [`@fast-link/next`](./packages/next/)   | Next.js App Router links and navigation regions |
| [`@fast-link/core`](./packages/core/)   | Plain DOM usage or a custom framework adapter   |
| [`@fast-link/react`](./packages/react/) | React lifecycle for a custom adapter            |

Start with `@fast-link/next` for a Next.js App Router application. Use the
React package only when building an adapter that `@fast-link/next` does not
provide.

Core handles [presses and matching clicks](./packages/core/README.md#understand-event-ordering).
React manages the [controller lifecycle](./packages/react/README.md#understand-the-hook-lifecycle).
Next adds [routing and cancellation](./packages/next/README.md#understand-navigation-and-click-behavior).

## Requirements

Fast Link supports Node.js 22 or later. See the package READMEs for framework
requirements.

## Get started with the Next.js App Router

```sh
npm install @fast-link/next
```

Use `FastLink` for an App Router link:

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

- Preserves Next Link options and synchronous `onNavigate` cancellation.
- Prepares primary mouse navigation on press and commits at accepted click.
- Keeps normal Link and browser behavior for other input methods.

Use `FastLinkRegion` when existing links share one navigation policy:

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

- Use `FastLink` for per-link options. It keeps its own options and policy inside
  a region.
- Regions cannot read Next Link options from ordinary rendered anchors.

Before adopting either interface:

- Click-time guard on `FastLink`: retain it in `onClick` or `onNavigate`.
- Click-time guard on an ordinary region link: add `data-no-fast-link`.
- For API routes or another application's pages, choose an explicit routing
  policy or opt out. Same origin does not imply App Router ownership.

More in the [`@fast-link/next` README](./packages/next/README.md):

- [Base paths](./packages/next/README.md#configure-a-nextjs-base-path)
- [Routing policies](./packages/next/README.md#route-links-across-application-boundaries)
- [Custom renderers](./packages/next/README.md#build-a-custom-renderer)

## How Fast Link handles input

Fast Link accepts unmodified primary-mouse `pointerdown` on eligible same-origin links.

- Native behavior: touch, pen, keyboard, middle, right, and modified clicks.
- Also native: downloads, external or hash-only URLs, non-`_self` targets,
  nested controls, and `data-no-fast-link` opt-outs.
- All integrations wait for accepted click and discard preparation on release
  away. Preparation requires the [supported experimental Next runtime](./packages/next/README.md#requirements).
- Accepted clicks are default-prevented while continuing to propagate.

See core's [eligibility rules](./packages/core/README.md#know-which-interactions-fast-link-accepts).

Attach Fast Link to the narrowest navigation region that shares one policy.

## Build another framework adapter

`@fast-link/core` provides each accepted intent with the source anchor, its
authored `href`, and a resolved same-origin `URL`. An adapter maps that intent to
its router and remains responsible for history, scroll, route state, and
transitions.

Use `@fast-link/react` to bind a core controller to a React-owned element. See
the [`@fast-link/core` README](./packages/core/README.md) for the DOM and
navigation contracts.

## Agent skill

Each npm package includes the [Fast Link skill](skills/fast-link/SKILL.md) to help
coding agents integrate and review navigation. The skill uses the package's
version and changelog.

- Add the installed skill's path to your repository's agent instructions. For
  Next.js, use `node_modules/@fast-link/next/skills/fast-link/SKILL.md`.
- Use one copy, from the package your application imports: `@fast-link/next`,
  `@fast-link/react`, or `@fast-link/core`.
- In a monorepo, resolve the path from the workspace that installs the package.

## Performance benchmarks

The historical measurements cover navigation on press, which has been removed.
They do not measure the current preparation path.
The historical benchmark configured an **85 ms mouse hold** for every variant;
that setting is not a typical-user gain or evidence of faster JavaScript execution.

See [How we benchmark](docs/benchmarks.md) for the manual procedure and measurement
limits. The [historical raw report](https://github.com/vercel-labs/fast-link/blob/fd4e030beb2f62dbf785b1066b564bccec43bcf0/local/fe6fd78dfb572725fccd5b37f555f61b536dda95/report.json)
records source revision `fe6fd78dfb572725fccd5b37f555f61b536dda95`, measured on one
Apple M4 Pro running macOS in five alternating batches. These controlled lab
measurements do not establish typical-user gains. Read the samples, ranges,
conditions, and environment in the report before using it to support a claim.

## Known limitations

- Next.js `useLinkStatus().pending` does not update during early navigation.
- Use route-level loading UI or [manage pending state in your app](./packages/next/README.md#pending-state).

All integrations wait for an accepted click. Discarding preparation does not
abort Next's request. Capture acceptance in regions and custom hooks precedes
later child guards; use `FastLink` when those guards must be able to cancel.

Chrome may not detect Fast Link's client-side navigations as
[soft navigations](https://developer.chrome.com/docs/web-platform/soft-navigations).
Monitoring tools that rely on this detection can attribute subsequent CLS and INP
to the previous page.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for setup and contribution guidelines.

## License

[MIT](./LICENSE)
