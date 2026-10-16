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
<summary>View all scenarios</summary>

| Scenario ID                    | Median    | Range         |
| ------------------------------ | --------- | ------------- |
| core.bare.accepted             | 4.1 us/op | 3.6–4.6 us/op |
| core.bare.ignored              | 1.7 us/op | 1.7–1.9 us/op |
| core.core.accepted             | 6 us/op   | 5.6–6.5 us/op |
| core.core.ignored              | 2 us/op   | 1.9–2 us/op   |
| next.fast.1.mount              | 0.1 ms    | 0–0.2 ms      |
| next.fast.1.unmount            | 0 ms      | 0–0.1 ms      |
| next.fast.1.update             | 0 ms      | 0–0.1 ms      |
| next.fast.100.mount            | 0.7 ms    | 0.6–0.7 ms    |
| next.fast.100.unmount          | 0.1 ms    | 0–0.2 ms      |
| next.fast.100.update           | 0.7 ms    | 0.6–0.7 ms    |
| next.fast.1000.mount           | 3.5 ms    | 3.4–3.8 ms    |
| next.fast.1000.unmount         | 0.9 ms    | 0.8–1 ms      |
| next.fast.1000.update          | 4.1 ms    | 4–4.3 ms      |
| next.fast.cold.navigation      | 6.3 ms    | 6.2–7 ms      |
| next.fast.cold.pressDuration   | 84 ms     | 84–85 ms      |
| next.fast.warm.navigation      | 2.9 ms    | 2.7–3.2 ms    |
| next.fast.warm.pressDuration   | 84 ms     | 83–84 ms      |
| next.next.1.mount              | 0.1 ms    | 0–0.1 ms      |
| next.next.1.unmount            | 0 ms      | 0–0.1 ms      |
| next.next.1.update             | 0 ms      | 0–0.1 ms      |
| next.next.100.mount            | 0.3 ms    | 0.2–0.5 ms    |
| next.next.100.unmount          | 0.1 ms    | 0–0.2 ms      |
| next.next.100.update           | 0.4 ms    | 0.2–0.4 ms    |
| next.next.1000.mount           | 2.2 ms    | 2.1–2.3 ms    |
| next.next.1000.unmount         | 0.5 ms    | 0.4–0.5 ms    |
| next.next.1000.update          | 1.8 ms    | 1.8–1.9 ms    |
| next.next.cold.navigation      | 92 ms     | 90–92 ms      |
| next.next.cold.pressDuration   | 83 ms     | 82–83 ms      |
| next.next.warm.navigation      | 86 ms     | 85–92 ms      |
| next.next.warm.pressDuration   | 82 ms     | 82–87 ms      |
| next.region.1.mount            | 0 ms      | 0–0.1 ms      |
| next.region.1.unmount          | 0 ms      | 0–0 ms        |
| next.region.1.update           | 0.1 ms    | 0–0.1 ms      |
| next.region.100.mount          | 0.3 ms    | 0.2–0.5 ms    |
| next.region.100.unmount        | 0.1 ms    | 0–0.1 ms      |
| next.region.100.update         | 0.2 ms    | 0.1–0.6 ms    |
| next.region.1000.mount         | 2.1 ms    | 1.9–2.2 ms    |
| next.region.1000.unmount       | 0.5 ms    | 0.3–0.6 ms    |
| next.region.1000.update        | 1.8 ms    | 1.6–1.8 ms    |
| next.region.cold.navigation    | 7 ms      | 6.3–7.3 ms    |
| next.region.cold.pressDuration | 84 ms     | 83–84 ms      |
| next.region.warm.navigation    | 2.9 ms    | 2.7–3 ms      |
| next.region.warm.pressDuration | 84 ms     | 82–84 ms      |
| react.plain.1.mount            | 0.1 ms    | 0–0.2 ms      |
| react.plain.1.unmount          | 0.1 ms    | 0–0.1 ms      |
| react.plain.1.update           | 0 ms      | 0–0 ms        |
| react.plain.accepted           | 7.6 us/op | 7.4–7.6 us/op |
| react.plain.ignored            | 3.8 us/op | 3.6–3.9 us/op |
| react.react.1.mount            | 0.1 ms    | 0–0.2 ms      |
| react.react.1.unmount          | 0.1 ms    | 0–0.2 ms      |
| react.react.1.update           | 0 ms      | 0–0.2 ms      |
| react.react.accepted           | 8.7 us/op | 8.5–9.1 us/op |
| react.react.ignored            | 2 us/op   | 1.9–2.3 us/op |

Tested versions: next 16.3.6, react 19.2.7, reactDom 19.2.7, core 0.0.1, bindings 0.0.1, adapter 0.0.1.
Source commit: 236f1d5e9bc07642988669b8e6ecafddce7d9800. [Raw results](https://github.com/vercel-labs/fast-link/blob/be1cc56b363366cc929a84a9f6e502b7c2761d7b/local/236f1d5e9bc07642988669b8e6ecafddce7d9800/report.json).
Controlled lab measurements. Navigation latency differences include the time next/link waits for mouse release. These results do not establish faster JavaScript execution or typical-user gains.

- Local baseline: Apple M4 Pro, Darwin 25.6.0, Chromium 147.0.7727.15.
- 5 alternating batches; 1,000 interactions after 100 warmups.
- Navigation requested an 80 ms mouse hold. Actual press durations appear in the table.
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
