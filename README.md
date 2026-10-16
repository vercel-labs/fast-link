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

## Performance benchmarks

<!-- benchmarks:start -->

[How we benchmark](docs/benchmarks.md)

<details>
<summary>View benchmark comparisons</summary>

Cells show median (min–max). Replace `*` in each scenario ID with the column's variant key.

### Core

| Scenario ID       | Bare DOM (`bare`, baseline) | `createFastLink` (`core`) |
| ----------------- | --------------------------- | ------------------------- |
| `core.*.accepted` | 4.2 (3.7–4.8) us/op         | 6.2 (5.7–6.3) us/op       |
| `core.*.ignored`  | 1.8 (1.7–2.1) us/op         | 2 (1.9–2.1) us/op         |

### React

| Scenario ID        | Plain anchor (`plain`, baseline) | `useFastLink` (`react`) |
| ------------------ | -------------------------------- | ----------------------- |
| `react.*.accepted` | 7.8 (7.4–8.2) us/op              | 9 (8.7–9.6) us/op       |
| `react.*.ignored`  | 3.9 (3.8–4.1) us/op              | 2.2 (2.1–2.3) us/op     |

### Next.js

Navigation measures pointerdown to destination commit with an **85 ms** mouse hold. `next/link` waits for release; earlier navigation does not establish faster JavaScript execution or typical-user gains.

| Scenario ID              | `next/link` (`next`, baseline) | `FastLink` (`fast`) | `FastLinkRegion` (`region`) |
| ------------------------ | ------------------------------ | ------------------- | --------------------------- |
| `next.*.warm.navigation` | 91 (90–96) ms                  | 3.1 (2.8–3.2) ms    | 3 (2.8–3.2) ms              |
| `next.*.cold.navigation` | 97 (94–98) ms                  | 6.9 (5.5–7.8) ms    | 6.7 (5.9–7.2) ms            |
| `next.*.100.mount`       | 0.5 (0.2–0.5) ms               | 0.7 (0.7–0.7) ms    | 0.3 (0.2–0.5) ms            |
| `next.*.100.update`      | 0.4 (0.1–0.5) ms               | 0.6 (0.6–0.6) ms    | 0.2 (0.1–0.6) ms            |
| `next.*.100.unmount`     | 0.1 (0.1–0.2) ms               | 0.1 (0–0.2) ms      | 0.1 (0–0.2) ms              |
| `next.*.1000.mount`      | 2.2 (2–2.4) ms                 | 3.4 (3.3–3.8) ms    | 2.1 (2–2.3) ms              |
| `next.*.1000.update`     | 1.8 (1.8–2) ms                 | 4.2 (4.1–4.5) ms    | 1.8 (1.7–1.8) ms            |
| `next.*.1000.unmount`    | 0.5 (0.5–0.5) ms               | 0.9 (0.8–1) ms      | 0.5 (0.4–0.5) ms            |

Raw results include all 53 measurements, including actual press durations and single-link lifecycle timings. Single-link timings can reach browser timer resolution.

Tested versions: next 16.3.6, react 19.2.7, reactDom 19.2.7, core 0.0.1, bindings 0.0.1, adapter 0.0.1.
Source commit: fe6fd78dfb572725fccd5b37f555f61b536dda95. [Raw results](https://github.com/vercel-labs/fast-link/blob/fd4e030beb2f62dbf785b1066b564bccec43bcf0/local/fe6fd78dfb572725fccd5b37f555f61b536dda95/report.json).
Controlled Chromium lab measurements.

- Local run: Apple M4 Pro, Darwin 25.6.0, Chromium 147.0.7727.15.
- 5 alternating batches; 1,000 interactions after 100 warmups.
- Navigation requested an **85 ms** mouse hold. Actual press durations are in the raw results.
- Displayed 0 ms values reflect browser timer resolution.

</details>
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
