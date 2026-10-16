# ▲ Fast Link

Fast Link helps your application feel faster by starting eligible same-origin
link navigation when you press the mouse, instead of waiting for release. Your
application gets the press-to-release interval to start loading the next page.

Keep optimizing page speed and using prefetching. Fast Link doesn't fix slow
pages, but when every millisecond matters, that head start can help your site cook.

## When to use Fast Link

Use Fast Link for ordinary links between pages in your app, when pressing the
link is enough to commit to navigation. Examples include documentation, product
pages, dashboard views, and links to form or checkout pages.

Keep ordinary click behavior for:

- Links that perform actions, such as submitting a form, placing an order, signing
  out, or deleting something.
- Links whose click handlers must run before navigation, such as validation or an
  unsaved-changes warning.
- Links that open or toggle UI, such as a modal, menu, or tab.
- Downloads and links that need release-time cancellation or URL dragging.

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

Wrap a group of existing links with `FastLinkRegion`. This example assumes one
App Router owns every destination and no link needs click-time checks or
individual Link options:

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

Primary mouse navigation now starts on `pointerdown`. Other input methods still
use the normal Link and browser behavior.

Use `FastLink` when one link needs its own Next.js options or `onNavigate`
cancellation. Add `data-no-fast-link` to an ordinary link inside a region when
its click-time behavior must run before navigation. See the
[`@fast-link/next` README](./packages/next/README.md) for component options,
opt-outs, routing policies, and custom renderers.

## How Fast Link handles input

Fast Link accepts only a primary mouse `pointerdown` on an eligible same-origin
link. It leaves these interactions to the browser:

- Touch and pen input
- Middle, right, and modified clicks
- Links with a `target` other than `_self`
- Downloads, external URLs, and hash-only links
- Presses that start on nested controls
- Keyboard activation
- An anchor or descendant with `data-no-fast-link`

After accepted navigation, Fast Link prevents the matching pointer-generated
click's default action without stopping propagation. Link and ancestor click
handlers still run if their elements remain mounted until release. A drag away
from the link can navigate without producing a click.

Attach Fast Link to the narrowest navigation region that shares one policy. In
Next.js, use `FastLinkRegion` for a group of links and `FastLink` for per-link
behavior.

## Build another framework adapter

`@fast-link/core` provides each accepted intent with the source anchor, its
authored `href`, and a resolved same-origin `URL`. An adapter maps that intent to
its router and remains responsible for history, scroll, route state, and
transitions.

Use `@fast-link/react` to bind a core controller to a React-owned element. See
the [`@fast-link/core` README](./packages/core/README.md) for the DOM and
navigation contracts.

## Agent skill

The optional [Fast Link skill](skills/fast-link/SKILL.md) helps coding agents
choose an integration, preserve existing link behavior, and verify navigation:

```sh
npx skills add vercel-labs/fast-link --skill fast-link
```

Installing an npm package does not activate the skill. The skill supports
Next.js App Router integrations and custom core or React adapters.

## Benchmarks

<!-- benchmarks:start -->

[How we benchmark](docs/benchmarks.md)

<!-- benchmarks:end -->

## Known limitations

Fast Link starts mouse navigation on press. Moving away before release won't
cancel it, and Fast Link provides no built-in abort or undo.

This is an accessibility limitation under
[WCAG 2.5.2: Pointer Cancellation (Level A)](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html).
See [failure F101](https://www.w3.org/WAI/WCAG22/Techniques/failures/F101) for activation on press without cancellation or reversal.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, validation, and package
boundaries.

## License

[MIT](./LICENSE)
