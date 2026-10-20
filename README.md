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
- Starts primary mouse navigation on press (`pointerdown`).
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

- Click-time guard on `FastLink`: opt out with `enabled={false}`.
- Click-time guard on an ordinary region link: add `data-no-fast-link`.
- For API routes or another application's pages, choose an explicit routing
  policy or opt out. Same origin does not imply App Router ownership.

More in the [`@fast-link/next` README](./packages/next/README.md):

- [Base paths](./packages/next/README.md#configure-a-nextjs-base-path)
- [Routing policies](./packages/next/README.md#route-links-across-application-boundaries)
- [Custom renderers](./packages/next/README.md#build-a-custom-renderer)

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

## Performance benchmarks

<!-- benchmarks:start -->

[How we benchmark](docs/benchmarks.md) · [Raw results](https://github.com/vercel-labs/fast-link/blob/fd4e030beb2f62dbf785b1066b564bccec43bcf0/local/fe6fd78dfb572725fccd5b37f555f61b536dda95/report.json)

<details>
<summary>View benchmark comparisons</summary>

- Runs: 5 alternating batches, 5 samples per scenario.
- Score: median time per workload; ranges and individual samples are in raw results.
- Mouse hold: **85 ms** requested for all navigation variants.
- Interaction workload: 1,000 synthetic interactions per sample, after 100 warmups. Times are per interaction.

### Core

| Workload (median time) | Bare DOM (baseline) | `createFastLink` |
| ---------------------- | ------------------- | ---------------- |
| Mouse press and click  | 4.2 µs              | 6.2 µs           |
| Ignored touch press    | 1.8 µs              | 2 µs             |

### React

| Workload (median time) | Plain anchor (baseline) | `useFastLink` |
| ---------------------- | ----------------------- | ------------- |
| Mouse press and click  | 7.8 µs                  | 9 µs          |
| Ignored touch press    | 3.9 µs                  | 2.2 µs        |

### Next.js

Navigation measures mouse press to destination commit. `next/link` waits for release; earlier navigation does not establish faster JavaScript execution or typical-user gains.

| Workload (median time)         | `next/link` (baseline) | `FastLink` | `FastLinkRegion` |
| ------------------------------ | ---------------------- | ---------- | ---------------- |
| Navigate to prefetched route   | 91 ms                  | 3.1 ms     | 3 ms             |
| Navigate to unprefetched route | 97 ms                  | 6.9 ms     | 6.7 ms           |
| Mount 100 links                | 0.5 ms                 | 0.7 ms     | 0.3 ms           |
| Update 100 links               | 0.4 ms                 | 0.6 ms     | 0.2 ms           |
| Unmount 100 links              | 0.1 ms                 | 0.1 ms     | 0.1 ms           |
| Mount 1,000 links              | 2.2 ms                 | 3.4 ms     | 2.1 ms           |
| Update 1,000 links             | 1.8 ms                 | 4.2 ms     | 1.8 ms           |
| Unmount 1,000 links            | 0.5 ms                 | 0.9 ms     | 0.5 ms           |

</details>

<sub>Measured on Apple M4 Pro (macOS).</sub>

<!-- benchmarks:end -->

## Known limitations

For Next.js early navigation, `useLinkStatus().pending` does not update because
public App Router calls cannot set Next Link's internal pending state. Use
route-level loading UI, or start application-owned pending state from
`onFastNavigate` and clear it when navigation completes. Define reset handling
for navigation failures, cancellation, and unmount so the indicator cannot stay
stuck. `onFastNavigate` observes a navigation attempt, not its completion.

Fast Link starts mouse navigation on press. Moving away before release won't
cancel it, and Fast Link provides no built-in abort or undo.

This is an accessibility limitation under
[WCAG 2.5.2: Pointer Cancellation (Level A)](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation.html).
See [failure F101](https://www.w3.org/WAI/WCAG22/Techniques/failures/F101) for activation on press without cancellation or reversal.

Chrome may not detect Fast Link's client-side navigations as
[soft navigations](https://developer.chrome.com/docs/web-platform/soft-navigations).
Monitoring tools that rely on this detection can attribute subsequent CLS and INP
to the previous page.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for local setup, validation, and package
boundaries.

## License

[MIT](./LICENSE)
