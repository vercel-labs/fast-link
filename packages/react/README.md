# ▲ @fast-link/react

`@fast-link/react` binds a `@fast-link/core` controller to a React-owned
anchor or navigation region. Use it when an application or framework adapter
needs its own routing policy.

For Next.js App Router applications, use
[`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
instead.

For press timing and opt-outs, see
[when to use Fast Link](https://github.com/vercel-labs/fast-link#when-to-use-fast-link).

## Requirements

Supports Node.js 22 or later, with React 19 (`>=19 <20`).

## Install the package

```sh
npm install @fast-link/react
```

## Bind navigation to a React region

Navigation starts on press, before a click handler can cancel it. Keep links
that need confirmation, release-time checks, or expected URL dragging native
by adding `data-no-fast-link` to the anchor.

`useFastLink` returns ref and click-capture bindings. Spread both on the same
anchor or element containing anchors, after its other props:

```tsx
'use client';

import { useFastLink } from '@fast-link/react';
import type { ReactNode } from 'react';

export function AppRegion({
  children,
  route,
}: {
  children: ReactNode;
  route: (destination: URL) => void;
}) {
  const attach = useFastLink<HTMLDivElement>({
    navigate: ({ url }) => route(url),
  });

  return (
    <div {...attach} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
```

Primary mouse navigation inside the region now calls `route` on `pointerdown`.
The intent provides the source anchor, its authored `href`, and a resolved
same-origin `URL`. The application handles routing, history, scroll, route
state, and transitions.

The package renders no wrapper and imports no router. The `display: contents`
element in the example belongs to the application.

## `useFastLink` reference

```ts
function useFastLink<T extends HTMLElement = HTMLElement>(
  options: FastLinkOptions & {
    forwardedRef?: ForwardedRef<T>;
    onClickCapture?: MouseEventHandler<T>;
  },
): {
  ref: (element: T | null) => void;
  onClickCapture: MouseEventHandler<T>;
};
```

| Option           | Type                   | Default                                   | Behavior                                                                |
| ---------------- | ---------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| `enabled`        | `boolean`              | `true`                                    | Controls whether new pointerdowns can start navigation                  |
| `navigate`       | `(intent) => void`     | `window.location.assign(intent.url.href)` | Performs navigation after `onFastNavigate`; its return value is ignored |
| `onFastNavigate` | `(intent) => void`     | None                                      | Runs synchronously before `navigate`                                    |
| `onClickCapture` | `MouseEventHandler<T>` | None                                      | Runs after core suppression, including for prevented clicks             |
| `forwardedRef`   | `ForwardedRef<T>`      | `null`                                    | Composes the caller's ref with the controller ref                       |

Core's `onFastNavigate` observes the accepted intent before `navigate`; it cannot
cancel navigation through a return value or `preventDefault()`. If it throws,
`navigate` still runs, then the error surfaces. A navigation error takes precedence
if both callbacks throw. The follow-up click remains suppressed.

The returned object, ref, and capture handler are stable. Pass a caller capture
handler through `onClickCapture`; the hook runs it after suppression, even when
the click is prevented. Spreading the bindings last preserves that composition.
A ref alone cannot suppress a click stopped by descendant React capture.

Place regions inside the DOM subtree they control, including portal and shadow
trees. React ancestry alone does not extend a region's DOM scope.

## Understand the hook lifecycle

React manages the controller attached to the element receiving the returned ref:

```text
Attach root
  -> create controller

Commit options
  -> replace every copied option
  -> keep pending click

Remove root or unmount
  -> destroy controller

Replace root
  -> destroy old controller
  -> create new controller
```

- Destroying the controller clears pending click state and removes listeners.
- Committed caller-ref changes run the old ref's cleanup before assigning the
  new ref.
- Server rendering attaches no controller.
- After an accepted press, the matching pointer click is default-prevented
  while propagation continues.
- Touch, pen, keyboard, and modified clicks keep their native behavior and do
  not call `navigate`.

Core owns [eligibility, click suppression, and event ordering](https://github.com/vercel-labs/fast-link/tree/main/packages/core#understand-event-ordering).
Add `data-no-fast-link` to an anchor or descendant when the browser must retain
the interaction.

## Related packages

- [`@fast-link/core`](https://github.com/vercel-labs/fast-link/tree/main/packages/core)
  documents eligibility, controller options, and adapter decisions.
- [`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
  provides App Router components and a custom-renderer hook.
