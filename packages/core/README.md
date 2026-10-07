# ▲ @fast-link/core

`@fast-link/core` starts eligible same-origin link navigation on primary mouse
`pointerdown`. Use it with plain DOM elements or as the interaction layer for a
framework adapter.

For Next.js App Router applications, use
[`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
instead.

## Requirements

Requires a browser DOM. See [`package.json`](./package.json) for the supported
Node.js version.

## Install the package

```sh
npm install @fast-link/core
```

## Start document navigation on pointerdown

Attach one controller to the narrowest element that contains links sharing the
same navigation behavior:

```ts
import { createFastLink } from '@fast-link/core';

const root = document.querySelector<HTMLElement>('nav');
if (!root) throw new Error('Navigation root not found');

const fastLink = createFastLink(root);
```

Primary mouse navigation now starts on `pointerdown`. By default, core navigates
with `window.location.assign()`. Call `fastLink.destroy()` when the root leaves
the document.

Pass a caller-owned `navigate` function when a client router owns the
destination:

```ts
import { createFastLink } from '@fast-link/core';

export function attachRouterNavigation(
  root: HTMLElement,
  navigate: (destination: URL) => void,
) {
  return createFastLink(root, {
    navigate: ({ url }) => navigate(url),
  });
}
```

Core validates the link before it calls the router. The adapter remains
responsible for history, scroll, route state, and transitions.

## Know which interactions Fast Link accepts

Core accepts only a primary mouse `pointerdown` on an eligible same-origin link.
It leaves these interactions to the browser:

- Touch and pen input
- Middle, right, and modified clicks
- Links with a `target` other than `_self`
- Downloads, external URLs, and hash-only links
- Presses that start on `button`, `input`, `label`, `select`, `summary`,
  `textarea`, or an element with `role="button"`
- An anchor or descendant with `data-no-fast-link`
- Keyboard activation

An accepted native event is claimed so nested roots, including separately
bundled copies of core, navigate once.

## API reference

| Export                   | Kind     | Purpose                                                |
| ------------------------ | -------- | ------------------------------------------------------ |
| `createFastLink`         | Function | Attach navigation behavior to an anchor or region      |
| `findAnchor`             | Function | Find the closest anchor within a boundary              |
| `resolveFastLink`        | Function | Validate and claim one pointer event                   |
| `runFastNavigation`      | Function | Apply a router or document navigation decision         |
| `FastLinkController`     | Type     | Update or destroy an attached controller               |
| `FastLinkOptions`        | Type     | Configure controller eligibility and callbacks         |
| `FastLinkIntent`         | Type     | Describe an accepted anchor and destination            |
| `FastNavigationDecision` | Type     | Select router or document navigation                   |
| `FastRouterDecision`     | Type     | Use the adapter route with an optional scroll override |
| `FastDocumentDecision`   | Type     | Load the validated URL with `assign` or `replace`      |

### `createFastLink`

```ts
function createFastLink(
  root: HTMLElement,
  options?: FastLinkOptions,
): FastLinkController;
```

The root can be one anchor or a region containing anchors.

| Option       | Type               | Default                                   | Behavior                                                                |
| ------------ | ------------------ | ----------------------------------------- | ----------------------------------------------------------------------- |
| `enabled`    | `boolean`          | `true`                                    | Controls whether new pointerdowns can start navigation                  |
| `navigate`   | `(intent) => void` | `window.location.assign(intent.url.href)` | Performs navigation after `onNavigate`; its return value is ignored     |
| `onNavigate` | `(intent) => void` | None                                      | Runs synchronously before `navigate`, for observation such as analytics |

`createFastLink` copies its options. Mutating the original object has no
effect.

| Controller method | Behavior                                                              |
| ----------------- | --------------------------------------------------------------------- |
| `update(options)` | Replaces every option without clearing a pending follow-up click      |
| `destroy()`       | Removes both listeners permanently; calling it more than once is safe |

### `FastLinkIntent`

| Field    | Type                | Value                                                              |
| -------- | ------------------- | ------------------------------------------------------------------ |
| `anchor` | `HTMLAnchorElement` | The source link                                                    |
| `href`   | `string`            | The original, unnormalized `href` attribute                        |
| `url`    | `URL`               | The same-origin destination resolved against the document base URI |

Core resolves and validates `url` against the document origin. A router with a
base path may need to derive its route from `href` or application metadata on
`anchor`.

### `findAnchor`

```ts
function findAnchor(
  target: EventTarget | null,
  boundary: EventTarget | null,
): HTMLAnchorElement | null;
```

`findAnchor` returns the closest anchor only when traversal reaches the supplied
boundary. A `null` boundary searches to the top of the target's element tree.

### `resolveFastLink`

```ts
function resolveFastLink(
  event: PointerEvent,
  anchor: HTMLAnchorElement,
): FastLinkIntent | null;
```

Pass the anchor associated with `event.target`, normally the result of
`findAnchor`. An accepted event returns an intent and is marked as handled.
Ineligible input returns `null` so native behavior can continue.

## Understand event ordering

For each pointerdown, a controller:

1. Clears stale click-suppression state.
2. Resolves and claims an eligible anchor.
3. Calls `onNavigate`.
4. Calls `navigate`.
5. Prevents the matching pointer-generated click's default action without
   stopping propagation.

Keyboard and synthetic clicks have `detail: 0` and remain native, including
after a pointer interaction whose click was lost.

## Share navigation decisions in an adapter

Use `runFastNavigation(intent, options)` when an adapter must select between its
router and document navigation:

```ts
import {
  createFastLink,
  runFastNavigation,
  type FastLinkIntent,
  type FastNavigationDecision,
  type FastRouterDecision,
} from '@fast-link/core';

type Adapter = {
  owns(intent: FastLinkIntent): boolean;
  observe?(decision: FastNavigationDecision): void;
  route(intent: FastLinkIntent, decision: FastRouterDecision): void;
};

export function attachAdapter(root: HTMLElement, adapter: Adapter) {
  return createFastLink(root, {
    navigate: (intent) =>
      runFastNavigation(intent, {
        defaultRouterDecision: { kind: 'router' },
        policy: () =>
          adapter.owns(intent)
            ? { kind: 'router' }
            : { kind: 'document', method: 'assign' },
        observe: (decision) => adapter.observe?.(decision),
        route: (decision) => adapter.route(intent, decision),
      }),
  });
}
```

The caller supplies the router implementation. Core imports no framework and
makes no router-ownership assumptions.

| Decision                                  | Action                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| `{ kind: 'router' }`                      | Use the adapter route and its proposed scroll behavior       |
| `{ kind: 'router', scroll: false }`       | Use the adapter route and preserve scroll position           |
| `{ kind: 'document', method: 'assign' }`  | Load the validated URL with a new history entry              |
| `{ kind: 'document', method: 'replace' }` | Load the validated URL and replace the current history entry |

`runFastNavigation` uses `defaultRouterDecision` only when `policy` is absent. A
policy runs once and synchronously. Decisions accept only their documented
fields.

The runner captures the URL before policy evaluation, validates the decision,
calls `observe` with a frozen snapshot, and attempts one selected action. An
observer error does not prevent navigation. A router error is surfaced without
document fallback. A throwing policy or invalid decision attempts document
assign before surfacing the policy error. If two operations throw, an
`AggregateError` preserves both errors in execution order.

## Understand controller ownership

A live controller attached directly to an anchor owns its press before any
containing controller, even when disabled. Destroying the anchor controller
returns ownership to the containing controller. Multiple controllers and
separately bundled copies share ownership registration, and cleanup removes only
the destroyed controller. Nested regions retain outer-first capture ordering.

## Related packages

- [`@fast-link/react`](https://github.com/vercel-labs/fast-link/tree/main/packages/react)
  binds a core controller to a React-owned element.
- [`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
  provides App Router links and navigation regions.
