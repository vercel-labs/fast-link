# ▲ @fast-link/core

`@fast-link/core` starts eligible same-origin link navigation on primary mouse
`pointerdown`. Use it with plain DOM elements or as the interaction layer for a
framework adapter. `createClickPreparation` is an additive controller for
adapters that prepare on press and navigate only after accepted click.

For Next.js App Router applications, use
[`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
instead.

For press timing and opt-outs, see
[when to use Fast Link](https://github.com/vercel-labs/fast-link#when-to-use-fast-link).

For interfaces that navigate on press, see the
[accessibility limitation](https://github.com/vercel-labs/fast-link#known-limitations).

## Requirements

Supports Node.js 22 or later. Navigation requires a browser DOM.

## Install the package

```sh
npm install @fast-link/core
```

The [Fast Link agent skill](https://github.com/vercel-labs/fast-link#agent-skill)
is included at `skills/fast-link/SKILL.md`.

## Start document navigation on pointerdown

Navigation starts on press, before a click handler can cancel it. Keep links
that need confirmation, release-time checks, or expected URL dragging native
by adding `data-no-fast-link` to the anchor.

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

## Initialize inside each iframe

- Load Fast Link and call `createFastLink` inside each iframe it controls.
  Use elements from that iframe's document.
- For example, run the document navigation quickstart above from the iframe's
  own script.
- A parent-document controller does not receive child-document events.
- Loading Fast Link in the parent and attaching its controllers to iframe
  elements is unsupported.

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

| Export                           | Kind     | Purpose                                                |
| -------------------------------- | -------- | ------------------------------------------------------ |
| `createFastLink`                 | Function | Attach navigation behavior to an anchor or region      |
| `createClickPreparation`         | Function | Prepare a gesture and consume its accepted click       |
| `runFastNavigation`              | Function | Apply a router or document navigation decision         |
| `validateFastNavigationDecision` | Function | Validate a decision without navigation or observation  |
| `ClickPreparationController`     | Type     | Match, update, discard, or destroy preparation         |
| `ClickPreparationOptions`        | Type     | Configure eligibility and speculative preparation      |
| `PreparedClick`                  | Type     | Consume or discard a matched activation once           |
| `FastLinkController`             | Type     | Update, suppress clicks, or destroy a controller       |
| `FastLinkOptions`                | Type     | Configure controller eligibility and callbacks         |
| `FastLinkIntent`                 | Type     | Describe an accepted anchor and destination            |
| `FastNavigationDecision`         | Type     | Select router or document navigation                   |
| `FastRouterDecision`             | Type     | Use the adapter route with an optional scroll override |
| `FastDocumentDecision`           | Type     | Load the validated URL with `assign` or `replace`      |

### `createFastLink`

```ts
function createFastLink(
  root: HTMLElement,
  options?: FastLinkOptions,
): FastLinkController;
```

The root can be one anchor or a region containing anchors.

| Option           | Type               | Default                                   | Behavior                                                                |
| ---------------- | ------------------ | ----------------------------------------- | ----------------------------------------------------------------------- |
| `enabled`        | `boolean`          | `true`                                    | Controls whether new pointerdowns can start navigation                  |
| `navigate`       | `(intent) => void` | `window.location.assign(intent.url.href)` | Performs navigation after `onFastNavigate`; its return value is ignored |
| `onFastNavigate` | `(intent) => void` | None                                      | Runs synchronously before `navigate`, for observation such as analytics |

`createFastLink` copies its options. Mutating the original object has no
effect.

| Controller method      | Behavior                                                              |
| ---------------------- | --------------------------------------------------------------------- |
| `update(options)`      | Replaces every option without clearing a pending follow-up click      |
| `suppressClick(event)` | Applies pending suppression from an earlier framework capture handler |
| `destroy()`            | Removes both listeners permanently; calling it more than once is safe |

Disable early navigation for new presses while preserving suppression of the
pending follow-up click. Destroy the controller when the region is no longer
used:

```ts
import { createFastLink } from '@fast-link/core';

export function attachNavigation(
  root: HTMLElement,
  navigate: (destination: URL) => void,
) {
  const options = { navigate: ({ url }: { url: URL }) => navigate(url) };
  const controller = createFastLink(root, options);

  return {
    setEnabled(enabled: boolean) {
      controller.update({ ...options, enabled });
    },
    destroy() {
      controller.destroy();
    },
  };
}
```

Pass the callbacks on each update; omitted options reset to their defaults.

Framework adapters can call `suppressClick(event)` before descendant capture
handlers run. Pass the framework event itself, with `target`, `detail`, and
`preventDefault`, so its prevention flag is updated. A containing controller
can suppress a managed descendant's pending click, even when the containing
controller has a pending click for another anchor. Only targets inside the
accepted anchor and its controller root consume that pending click. Unrelated
clicks and detail-zero clicks remain native, and calls after destroy do nothing.
Use `@fast-link/react` to supply this capture binding in React rather than
implementing it in an app.

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

`createFastLink` checks eligibility and claims an accepted primary mouse press before
calling navigation callbacks. It remembers the anchor so it can prevent the
later pointer click's default navigation:

```text
Ready
  |
  | Accept press; claim event
  | Remember anchor
  v
Pending click
  | Call onFastNavigate, then navigate
  | Options update: stay here
  |
  | Matching pointer click:
  | clear pending; prevent default
  v
Ready
```

- A matching click's target must be inside both the accepted anchor and the
  controller root.
- Core prevents the click's default action without stopping propagation. Click
  handlers can still run if their elements remain mounted, but cannot cancel
  navigation that has already started.
- A follow-up click may never arrive. Each new `pointerdown` clears stale pending
  state before eligibility checks.
- Destroying the controller clears pending state and removes its listeners.

Core's `onFastNavigate` observes the accepted intent. It receives no cancellation
event, and its return value is ignored. If it throws, `navigate` still runs, then
the error surfaces. If navigation also throws, the navigation error takes
precedence. The follow-up click remains suppressed.

Next's `onNavigate` receives a cancellable event. The navigation runner's
`observe` callback receives a frozen decision after policy selection. Navigation
is still attempted if `observe` throws.

Clicks with `detail: 0`, including keyboard activation, remain native even after
a pointer interaction whose click was lost. If the follow-up never arrives,
a later scripted positive-detail click on the same anchor can still be
suppressed; its event fields do not distinguish it from the missing follow-up.

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
