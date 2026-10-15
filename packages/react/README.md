# ▲ @fast-link/react

`@fast-link/react` binds a `@fast-link/core` controller to a React-owned
anchor or navigation region. Use it when an application or framework adapter
needs its own routing policy.

For Next.js App Router applications, use
[`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
instead.

## Requirements

See [`package.json`](./package.json) for supported Node.js and React versions.

## Install the package

```sh
npm install @fast-link/react
```

## Bind navigation to a React region

Navigation starts on press. A later click handler cannot cancel it. Leave
confirmation, release-time checks, and expected URL dragging on the native
path by adding `data-no-fast-link` to the anchor.

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
same-origin `URL`. The application supplies routing, history, scroll, route
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

| Option           | Type                   | Default                                   | Behavior                                                            |
| ---------------- | ---------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| `enabled`        | `boolean`              | `true`                                    | Controls whether new pointerdowns can start navigation              |
| `navigate`       | `(intent) => void`     | `window.location.assign(intent.url.href)` | Performs navigation after `onNavigate`; its return value is ignored |
| `onNavigate`     | `(intent) => void`     | None                                      | Runs synchronously before `navigate`                                |
| `onClickCapture` | `MouseEventHandler<T>` | None                                      | Runs after core suppression, including for prevented clicks         |
| `forwardedRef`   | `ForwardedRef<T>`      | `null`                                    | Composes the caller's ref with the controller ref                   |

Core's `onNavigate` observes the accepted intent before `navigate`; it cannot
cancel navigation through a return value or `preventDefault()`. If it throws,
`navigate` is not called.

The returned object, ref, and capture handler are stable. Pass a caller capture
handler through `onClickCapture`; the hook runs it after suppression, even when
the click is prevented. Spreading the bindings last preserves that composition.
A ref alone cannot suppress a click stopped by descendant React capture.

Place regions inside the DOM subtree they control, including portal and shadow
trees. React ancestry alone does not extend a region's DOM scope.

## Understand the hook lifecycle

`useFastLink`:

- Applies committed option and caller-ref changes without losing a pending
  follow-up click
- Replaces every core option when the component commits new options
- Destroys the controller when the root changes or unmounts
- Runs callback-ref cleanup before replacing a callback ref
- Attaches no controller during server rendering

Fast Link eligibility, click suppression, and event ordering come from
`@fast-link/core`. Add `data-no-fast-link` to an anchor or descendant when the
browser must retain the interaction.

## Related packages

- [`@fast-link/core`](https://github.com/vercel-labs/fast-link/tree/main/packages/core)
  documents eligibility, controller options, and adapter decisions.
- [`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next)
  provides App Router components and a custom-renderer hook.
