# ▲ @fast-link/core

Core prepares work on eligible mouse presses and matches the later click.
Adapters own click acceptance, default prevention, and navigation. Core imports
no framework or router.

## Requirements

Node.js 22 or later. The controller runs in a browser; package imports and the
navigation runner can be used without DOM globals.

## Install the package

```sh
npm install @fast-link/core
```

The [Fast Link agent skill](https://github.com/vercel-labs/fast-link#agent-skill)
is included at `skills/fast-link/SKILL.md`.

## Bind preparation and click acceptance

```ts
import { createClickPreparation } from '@fast-link/core';

const root = document.querySelector<HTMLElement>('nav')!;
const controller = createClickPreparation(root, {
  prepare: () => null, // Supply speculative work here; never navigate on press.
});

function accept(event: MouseEvent) {
  const candidate = controller.matchClick(event);
  try {
    // Run synchronous guards here. Return without consuming when canceled.
    if (event.defaultPrevented) return;
    const activation = candidate?.consume();
    if (!activation) return;
    event.preventDefault();
    const { anchor, url } = activation.intent;
    anchor.ownerDocument.defaultView?.location.assign(url.href);
  } finally {
    candidate?.discard();
  }
}
root.addEventListener('click', accept);

// On teardown:
root.removeEventListener('click', accept);
controller.destroy();
```

The example accepts at the root's bubble handler. Place acceptance where your
framework can run its guards first. Match and finalize within the same click
dispatch; asynchronous guards are outside this contract.

## Initialize inside each iframe

Load the package and initialize controllers inside each frame it controls.
Parent-document controllers do not receive child-document events. Attaching a
parent-loaded controller to an iframe element is unsupported. URLs resolve
against the anchor's own document base URI and origin.

## Know which interactions Fast Link accepts

Core accepts only a primary mouse `pointerdown` on an eligible same-origin link.

Accepted anchor roles:

- No `role` attribute, an empty value, or only ASCII whitespace.
- A single `link` token, case-insensitive, with optional surrounding ASCII whitespace.

ASCII whitespace means tab, line feed, form feed, carriage return, or space.

It leaves these interactions to the browser:

- Touch and pen input
- Middle, right, and modified clicks
- Links with a `target` other than `_self`
- Downloads, external URLs, and hash-only links
- Anchors with other roles or role lists
- Presses that start on `button`, `input`, `label`, `select`, `summary`,
  `textarea`, or an element with a `button` role token
- An anchor or descendant with `data-no-fast-link`
- Keyboard activation

An accepted native event is claimed so nested roots, including separately
bundled copies of core, navigate once.

## API reference

Exports: `createClickPreparation`, `ClickPreparationController`,
`ClickPreparationOptions`, `PreparedClick`, `FastLinkIntent`,
`runFastNavigation`, `validateFastNavigationDecision`, `FastRouterDecision`,
`FastDocumentDecision`, and `FastNavigationDecision`.

### `createClickPreparation`

```ts
function createClickPreparation<P>(
  root: HTMLElement,
  options: { enabled?: boolean; prepare(intent: FastLinkIntent): P | null },
): ClickPreparationController<P>;
```

`prepare` runs on eligible primary mouse press. It must not navigate; errors
are swallowed so click-time fallback remains available. Core stores the opaque
result without a readiness or abort protocol.

Pass the native click to `controller.matchClick(event)` before synchronous
adapter guards. If a candidate is returned, call `candidate.consume()` after
those guards accept, or `candidate.discard()` when they cancel. Always finalize
the candidate, including when a guard throws or the framework takes a native path.
Consuming returns `{ intent, prepared }` once, or `null` if invalidated. Core
rechecks live eligibility and managed-anchor priority; changed destinations
return `prepared: null`. The adapter owns default prevention and routing.

New input, cancellation, dragging, release away, destruction, and disabling
invalidate preparation, including while a candidate is awaiting guards.
`update(options)` replaces copied options; other updates preserve the gesture
for the adapter to revalidate. `discard()` drops the current gesture.
`destroy()` also removes listeners and anchor ownership. Discarding a result
does not abort provider work. Keep matching and acceptance synchronous.

### `validateFastNavigationDecision`

Validates an unknown value and returns a frozen copy of a supported router or
document decision. Invalid values, including thenables, throw `TypeError`.
Extra fields are ignored. This function performs no navigation or observation;
use it for speculative classification without the runner's document fallback.

### `FastLinkIntent`

| Field    | Type                | Value                                                              |
| -------- | ------------------- | ------------------------------------------------------------------ |
| `anchor` | `HTMLAnchorElement` | The source link                                                    |
| `href`   | `string`            | The original, unnormalized `href` attribute                        |
| `url`    | `URL`               | The same-origin destination resolved against the document base URI |

Core resolves and validates `url` against the document origin. A router with a
base path may need to derive its route from `href` or application metadata on
`anchor`.

## Understand event ordering

1. An eligible press claims the event and runs speculative preparation.
2. The adapter matches the click before its synchronous guards.
3. After acceptance, `consume()` rechecks the live anchor and claims the click.
4. The adapter prevents the default action and navigates once.

Core never prevents clicks or navigates. Canceled or invalidated candidates
return no activation. Keyboard clicks remain native. New input, release away,
dragging, blur, disabling, and destruction discard the gesture. A release with
no click expires on the next timer turn. Synthetic events establish supplied
event handling, not trusted browser activation.

## Share navigation decisions in an adapter

After accepting a click, call `runFastNavigation(intent, options)` with:

- `defaultRouterDecision`, used when `policy` is absent.
- `policy`, an optional synchronous callback returning a decision.
- `observe`, an optional callback receiving the frozen decision.
- `route`, the callback that performs router navigation.

The adapter captures its route inputs in these callbacks. Core captures the
validated document URL before invoking policy.

| Decision                                  | Action                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| `{ kind: 'router' }`                      | Use the adapter route and its proposed scroll behavior       |
| `{ kind: 'router', scroll: false }`       | Use the adapter route and preserve scroll position           |
| `{ kind: 'document', method: 'assign' }`  | Load the validated URL with a new history entry              |
| `{ kind: 'document', method: 'replace' }` | Load the validated URL and replace the current history entry |

`runFastNavigation` uses `defaultRouterDecision` only when `policy` is absent. A
policy runs once and synchronously. Extra decision properties are ignored.

The runner captures the URL before policy evaluation, validates the decision,
calls `observe` with a frozen snapshot, and attempts one selected action. An
observer error does not prevent navigation. A router error is surfaced without
document fallback. A throwing policy or invalid decision attempts document
assign before surfacing the policy error. If navigation also throws after a
policy or observer error, the navigation error takes precedence.

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
