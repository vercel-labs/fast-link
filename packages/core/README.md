# ▲ @fast-link/core

`@fast-link/core` starts work for eligible same-origin link navigation on a
primary mouse press. It can start preparing right after press and navigate on
the accepted click, or navigate on press. Use it with plain DOM elements or as
the interaction layer for a framework adapter.

For Next.js App Router applications, use
[`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
instead.

For press timing and opt-outs, see
[when to use Fast Link](https://github.com/vercel-labs/fast-link#when-to-use-fast-link).

Sites requiring WCAG Level A or AA conformance should leave Fast Link disabled.
See the [accessibility limitation](https://github.com/vercel-labs/fast-link#known-limitations).

## Requirements

Supports Node.js 22 or later. Navigation requires a browser DOM.

## Install the package

```sh
npm install @fast-link/core
```

The [Fast Link agent skill](https://github.com/vercel-labs/fast-link#agent-skill)
is included at `skills/fast-link/SKILL.md`.

## Choose a navigation mode

`createLinkInteraction` attaches one controller to a root and handles eligible
mouse input in an explicit mode:

| Mode        | Behavior                                                              |
| ----------- | --------------------------------------------------------------------- |
| `release`   | Prepare after press; the adapter navigates on the accepted click.     |
| `immediate` | Navigate on press, before release. Releasing away cannot cancel it.   |
| `native`    | Leave new interactions to ordinary link behavior. Needs no callbacks. |

```ts
import { createLinkInteraction } from '@fast-link/core';

export function attachNavigation(
  root: HTMLElement,
  navigate: (destination: URL) => void,
) {
  const controller = createLinkInteraction(root, {
    mode: 'immediate',
    navigate: ({ url }) => navigate(url),
  });
  return {
    setAccelerated(accelerated: boolean) {
      controller.update(
        accelerated
          ? { mode: 'immediate', navigate: ({ url }) => navigate(url) }
          : { mode: 'native' },
      );
    },
    destroy: () => controller.destroy(),
  };
}
```

Release mode needs an adapter that accepts the click; see
[`createLinkInteraction`](#createlinkinteraction). The following sections
cover `createFastLink`, the earlier controller that navigates on press with
document navigation by default.

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
| `createLinkInteraction`          | Function | Handle a root in release, immediate, or native mode    |
| `createFastLink`                 | Function | Attach navigation behavior to an anchor or region      |
| `createClickPreparation`         | Function | Prepare after press and match the accepted click       |
| `runFastNavigation`              | Function | Apply a router or document navigation decision         |
| `validateFastNavigationDecision` | Function | Check a policy result without navigating               |
| `LinkMode`                       | Type     | `'release' \| 'immediate' \| 'native'`                 |
| `LinkInteractionController`      | Type     | Update, match or suppress clicks, or destroy           |
| `LinkInteractionOptions`         | Type     | Configure the mode and its callbacks                   |
| `FastLinkController`             | Type     | Update, suppress clicks, or destroy a controller       |
| `FastLinkOptions`                | Type     | Configure controller eligibility and callbacks         |
| `ClickPreparationController`     | Type     | Update, match clicks, discard, or destroy preparation  |
| `ClickPreparationOptions`        | Type     | Configure preparation and whether it is enabled        |
| `PreparedClick`                  | Type     | Consume or discard one matched click                   |
| `FastLinkIntent`                 | Type     | Describe an accepted anchor and destination            |
| `FastNavigationDecision`         | Type     | Select router or document navigation                   |
| `FastRouterDecision`             | Type     | Use the adapter route with an optional scroll override |
| `FastDocumentDecision`           | Type     | Load the validated URL with `assign` or `replace`      |

### `createLinkInteraction`

```ts
function createLinkInteraction<P>(
  root: HTMLElement,
  options:
    | { mode: 'release'; prepare(intent: FastLinkIntent): P | null }
    | {
        mode: 'immediate';
        beforeNavigate?(intent: FastLinkIntent): boolean;
        navigate(intent: FastLinkIntent): void;
      }
    | { mode: 'native' },
  isActive?: () => boolean,
): LinkInteractionController<P>;
```

The root can be one anchor or a region containing anchors. The mode has no
default. Options are copied at creation and on each `update()`.

Pass `isActive` when the owner can detach the root before calling `destroy()`,
such as a framework ref that can reattach within one commit. It defaults to
always active. While it returns `false`:

- A press stays native: the root claims and prepares nothing and arms no
  suppression. The root keeps its ownership, so containing regions leave the
  link native too.
- Suppression armed earlier still applies and settles on the next press, as
  usual.
- A guard that deactivates the root cancels immediate navigation; as with a
  canceled guard, its follow-up click stays suppressed.
- Release `matchClick` and `consume()` return `null`.

Release mode prepares like [`createClickPreparation`](#createclickpreparation).
Handle its clicks with `matchClick(event)` and the same consume or discard
sequence. Core never prevents the click or navigates in release mode.

Immediate mode handles an eligible press in this order:

1. Claim the press and arm suppression of the follow-up click.
2. Call `beforeNavigate(intent)`. Returning `false` cancels navigation. An error
   propagates. Either way, the follow-up click stays suppressed.
3. Recheck the attempt. A mode change, new input at the root, destruction,
   deactivation, a change of owner, or a link that is no longer eligible
   cancels it. A same-mode update or `href` change during the guard is used.
4. Call the current `navigate(intent)`. Errors propagate and are not retried.

Native mode prepares, claims, and navigates nothing. The root still owns its
ordinary links, so containing regions leave them native too.

| Controller method      | Behavior                                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `update(options)`      | Replaces every option. A same-mode update keeps pending work. A mode change discards preparation and never revives it.                    |
| `matchClick(event)`    | In release mode, returns a once-only candidate for the matching click. Returns `null` in other modes.                                     |
| `suppressClick(event)` | Applies pending suppression from an earlier framework capture handler. Returns whether the click is suppressed.                           |
| `discard()`            | Drops release-mode preparation and matched candidates. Never clears follow-up click suppression.                                          |
| `destroy()`            | Discards pending work and suppression, removes listeners, and releases the root's ownership. Repeated calls and later updates do nothing. |

Follow-up click suppression belongs to the root. It survives mode, option, and
`href` changes, including a change to native mode. It prevents the click's
default action without stopping propagation and settles on the matching click,
the next `pointerdown` at the root, or destruction. Detail-zero clicks and
clicks outside the accepted anchor stay native. Pass the native event to
`suppressClick`; when it returns `true`, a framework should also prevent its
own event wrapper.

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
  isActive?: () => boolean,
): ClickPreparationController<P>;
```

`prepare` runs in the task after an eligible primary mouse press and must not
navigate. It runs only while the gesture is still pending, the root is active,
and the root still owns the link. A click matched before then gets
`prepared: null`. Core stores
its return value without checking whether the work is ready or providing a way
to abort it. If `prepare` throws, core ignores the error so the adapter can still
handle the click.

`isActive` works as in [`createLinkInteraction`](#createlinkinteraction): while
it returns `false`, a press prepares nothing, and `matchClick` and `consume()`
return `null`.

Handle the click in this order:

1. Pass the native click to `controller.matchClick(event)` before running
   synchronous cancellation handlers.
2. If it returns a candidate and the handlers allow navigation, call
   `candidate.consume()`. Navigate only if it returns a result.
3. Call `candidate?.discard()` in `finally`, including when a handler throws or
   the framework handles the click.

Complete this sequence synchronously during the click event. The adapter calls
`preventDefault()` and performs navigation after consuming a valid candidate.

`consume()` rechecks the link's current eligibility, its per-link priority over
containing regions, and the root's activity. It returns one of these results:

| Result                        | Meaning                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `null`                        | The candidate was already consumed or is no longer valid. Do not navigate through it.                                           |
| `{ intent, prepared: value }` | The click can navigate using the current intent and the stored preparation.                                                     |
| `{ intent, prepared: null }`  | The click can navigate, but no preparation can be reused. This includes a changed destination and a click before `prepare` ran. |

New input, cancellation, dragging, release away, blur, destruction, and
disabling invalidate preparation, including while cancellation handlers run. A
release with no click expires on the next timer turn. Core never prevents the
click or navigates.

| Controller method   | Behavior                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `update(options)`   | Copies and replaces every option. Disabling discards the gesture; other updates preserve it for the adapter to revalidate. |
| `matchClick(event)` | Returns a once-only candidate for the click that completes the prepared gesture, or `null`.                                |
| `discard()`         | Drops the current gesture.                                                                                                 |
| `destroy()`         | Discards the gesture, removes listeners, and releases the anchor's priority over containing regions.                       |

Discarding preparation does not abort the work started by `prepare`.

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

This section describes `createFastLink`. For immediate mode, see the ordering
under [`createLinkInteraction`](#createlinkinteraction): `beforeNavigate` can
cancel navigation, unlike `onFastNavigate`.

Core checks eligibility and claims an accepted primary mouse press before
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
containing controller, even when disabled or native. Destroying the anchor
controller returns ownership to the containing controller. Multiple controllers
and separately bundled copies share ownership registration, and cleanup removes
only the destroyed controller.

Link interaction regions register when created, in every mode. An ordinary link
belongs to its closest link interaction region, which supplies its mode. A
native inner region keeps containing link interaction regions from accelerating
its links, and an accelerated inner region works inside a native one. A losing
region does no preparation or navigation for that interaction.

`createFastLink` and `createClickPreparation` regions neither register nor check
regions. They follow outer-first capture ordering, including around or inside
link interaction regions, and still defer to managed anchors.

## Related packages

- [`@fast-link/react`](https://github.com/vercel-labs/fast-link/tree/main/packages/react)
  binds a core controller to a React-owned element.
- [`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
  provides App Router links and navigation regions.
