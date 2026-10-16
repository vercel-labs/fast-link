# ▲ Fast Link

Fast Link starts eligible same-origin link navigation on `pointerdown` instead
of waiting for `click`. Primary mouse navigation starts when the user presses a
link, while touch, pen, keyboard, and modified clicks keep their native behavior.
Starting on press gives routing work a head start while you release the mouse.

## When to use Fast Link

Fast Link starts mouse navigation on press. Moving away before release won't
cancel it.

Use `enabled={false}` or `data-no-fast-link` to keep ordinary click behavior for
release-time cancellation, confirmation checks, or URL dragging.

## Choose a package

| Package                                 | Use it for                                      |
| --------------------------------------- | ----------------------------------------------- |
| [`@fast-link/next`](./packages/next/)   | Next.js App Router links and navigation regions |
| [`@fast-link/core`](./packages/core/)   | Plain DOM usage or a custom framework adapter   |
| [`@fast-link/react`](./packages/react/) | React lifecycle for a custom adapter            |

Start with `@fast-link/next` for a Next.js App Router application. Use the
React package only when building an adapter that `@fast-link/next` does not
provide.

## Get started with the Next.js App Router

See the
[`@fast-link/next` package manifest](./packages/next/package.json) for Next.js and
React peer requirements.

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

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, validation, and package
boundaries.

## License

[MIT](./LICENSE)
