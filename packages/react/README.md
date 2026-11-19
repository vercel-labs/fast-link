# ▲ @fast-link/react

`@fast-link/react` binds a `@fast-link/core` controller to a React-owned
anchor or navigation region. Use it when an application or framework adapter
needs its own routing policy.

| Hook                  | Binds                                                                         |
| --------------------- | ----------------------------------------------------------------------------- |
| `useLinkInteraction`  | `createLinkInteraction` in `release`, `immediate`, or `native` mode           |
| `useClickPreparation` | `createClickPreparation`: prepare after press, navigate on the accepted click |

For Next.js App Router applications, use
[`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
instead.

For press timing and opt-outs, see
[when to use Fast Link](https://github.com/vercel-labs/fast-link#when-to-use-fast-link).

Sites requiring WCAG Level A or AA conformance should not use immediate mode.
Release mode keeps release-time cancellation, but opting in doesn't by itself
establish conformance.
See the [accessibility limitation](https://github.com/vercel-labs/fast-link#known-limitations).

## Requirements

Supports Node.js 22 or later, with React 19 (`>=19 <20`).

## Install the package

```sh
npm install @fast-link/react
```

The [Fast Link agent skill](https://github.com/vercel-labs/fast-link#agent-skill)
is included at `skills/fast-link/SKILL.md`.

## Choose a navigation mode

`useLinkInteraction` binds one controller to a root and switches its mode
without replacing the element or the controller:

```tsx
'use client';

import { useLinkInteraction } from '@fast-link/react';
import type { ReactNode } from 'react';

export function AppRegion({
  accelerated,
  children,
  route,
}: {
  accelerated: boolean;
  children: ReactNode;
  route: (url: URL) => void;
}) {
  const binding = useLinkInteraction<never, HTMLDivElement>(
    accelerated
      ? { mode: 'immediate', navigate: ({ url }) => route(url) }
      : { mode: 'native' },
  );
  return (
    <div ref={binding.ref} onClickCapture={binding.suppressClick}>
      {children}
    </div>
  );
}
```

In immediate mode, primary mouse navigation inside the region calls `route` on
`pointerdown`, and `suppressClick` prevents the follow-up click. Native mode
leaves new clicks to the browser or the application's link handling. A click
still owed suppression by an earlier immediate press stays suppressed.

Release mode prepares in the task after press. Accept its click with
`matchClick` as in [the preparation example](#prepare-after-press-and-navigate-on-click).

Immediate navigation starts on press, before a click handler can cancel it.
Keep links that need confirmation, release-time checks, or expected URL
dragging native by adding `data-no-fast-link` to the anchor.

The intent provides the source anchor, its authored `href`, and a resolved
same-origin `URL`. The application handles routing, history, scroll, route
state, and transitions. The package renders no wrapper and imports no router.

Call your own capture handler after `suppressClick`, so it sees the prevented
follow-up click. Place regions inside the DOM subtree they control, including
portal and shadow trees. React ancestry alone does not extend a region's DOM
scope.

## Prepare after press and navigate on click

```tsx
'use client';

import { useClickPreparation } from '@fast-link/react';
import type { ReactNode } from 'react';

export function AppRegion({
  children,
  route,
}: {
  children: ReactNode;
  route: (url: URL) => void;
}) {
  const binding = useClickPreparation({ prepare: () => null });
  return (
    <div
      ref={binding.ref}
      onClick={(event) => {
        const candidate = binding.matchClick(event.nativeEvent);
        try {
          if (event.defaultPrevented) return;
          const activation = candidate?.consume();
          if (!activation) return;
          event.preventDefault();
          route(activation.intent.url);
        } finally {
          candidate?.discard();
        }
      }}
    >
      {children}
    </div>
  );
}
```

This example accepts at bubble time, after child handlers. An adapter chooses
the acceptance point that preserves its framework's guards. Supply speculative
work through `prepare(intent)`; it must not navigate.

## `useLinkInteraction` reference

```ts
function useLinkInteraction<P, T extends HTMLElement = HTMLElement>(
  options: LinkInteractionOptions<P> & { forwardedRef?: ForwardedRef<T> },
): LinkInteractionBinding<P, T>;

interface LinkInteractionBinding<P, T extends HTMLElement = HTMLElement> {
  ref(element: T | null): void;
  matchClick(event: MouseEvent): PreparedClick<P> | null;
  discard(): void;
  suppressClick(event: React.MouseEvent): boolean;
}
```

Pass the [core options](https://github.com/vercel-labs/fast-link/tree/main/packages/core#createlinkinteraction)
for the selected mode on each render, plus an optional `forwardedRef`. The
returned object and its handlers are stable.

| Handler                | Behavior                                                                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ref`                  | Attach to the anchor or region the controller handles.                                                                                                              |
| `matchClick(event)`    | In release mode, matches the native click before synchronous guards. Consume or discard the candidate during the same dispatch. Returns `null` in other modes.      |
| `discard()`            | Drops release-mode preparation and matched candidates. Never clears follow-up click suppression.                                                                    |
| `suppressClick(event)` | Call from a click-capture handler before matching. Prevents the follow-up click of an immediate press on the native and React events and returns whether it did so. |

`suppressClick` keeps propagation, so later click handlers still run and see
the prevented event. A region's capture handler also suppresses a click owed to
a managed link inside it.

## `useClickPreparation` reference

`useClickPreparation<P, T>(options)` accepts `enabled`, `prepare(intent)`, and an
optional `forwardedRef`. It returns stable `{ ref, matchClick, discard }`
handlers.

Attach `ref` to the root and pass `event.nativeEvent` to `matchClick` before
synchronous guards. Call the candidate's `consume()` after acceptance, or
`discard()` on cancellation, errors, or a native framework path. Finalize every
candidate during the same click dispatch. See the
[core contract](https://github.com/vercel-labs/fast-link/tree/main/packages/core#createclickpreparation)
for eligibility, matching, cancellation, and preparation errors.

## Understand the hook lifecycle

`useLinkInteraction` and `useClickPreparation` share this lifecycle:

- Attaching the ref creates a controller.
- Committed options replace the controller's copied options before a caller
  ref changed in the same commit is replaced, so input dispatched by the new
  caller ref uses the new options.
- In `useLinkInteraction`, changing the mode keeps the element and the
  controller. Leaving release mode discards a held press without navigating.
  Follow-up click suppression survives mode, option, `href`, and same-element
  ref changes.
- In `useClickPreparation`, valid preparation survives updates; `enabled: false`
  discards the gesture.
- Reattaching the same element within one React commit keeps pending work.
- While the ref is detached, the controller ignores presses and rejects
  activation:
  - A press prepares nothing, calls neither `beforeNavigate` nor `navigate`,
    and leaves its click native.
  - `matchClick` and a candidate's `consume()` return `null`.
  - Earlier click suppression can still settle.
- Replacing the element or unmounting destroys the controller. If the ref stays
  detached, cleanup runs after the commit.
- When the element is replaced in the same commit as an option or caller-ref
  change, the new controller starts with the previous commit's options and the
  previous caller ref receives the new element. The hook's layout effect
  replaces both later in that commit; input dispatched before then uses the
  previous options.
- Caller-ref replacement runs the old cleanup before assigning the new ref.
  Callback cleanup functions and object refs are supported.
- Strict Mode replay and a hidden `<Activity>` destroy the controller; it is
  recreated when React reattaches the ref.
- Server rendering attaches no controller. Gestures cause no React state
  updates.

Core owns [eligibility, click suppression, and event ordering](https://github.com/vercel-labs/fast-link/tree/main/packages/core#understand-event-ordering).

## Related packages

- [`@fast-link/core`](https://github.com/vercel-labs/fast-link/tree/main/packages/core)
  documents eligibility, controller options, and adapter decisions.
- [`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
  provides App Router components and a custom-renderer hook.
