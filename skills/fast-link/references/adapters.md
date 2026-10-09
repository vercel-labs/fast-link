# Core and React adapters

Read this for plain DOM integration or an application-owned navigation adapter.
Next.js App Router applications should use `@fast-link/next` and the
[Next.js reference](next.md).

## Plain DOM

```ts
import { createFastLink } from '@fast-link/core';

export function attachNavigation(root: HTMLElement) {
  const controller = createFastLink(root);
  return () => controller.destroy();
}
```

Attach to an anchor or the narrowest containing element that shares a policy.
Without a `navigate` callback, the controller uses the anchor's window to call
`location.assign(intent.url.href)`. Call `destroy()` when the root is no longer
used; repeated destruction is harmless.

Options are copied. Use `controller.update(allOptions)` for configuration
changes: it replaces every option rather than merging, while retaining any
pending follow-up click. Mutating the original options object does not update
the controller.

## Navigation intents

The `navigate(intent)` callback receives:

| Field    | Meaning                      |
| -------- | ---------------------------- |
| `anchor` | The source anchor element    |
| `href`   | The authored href attribute  |
| `url`    | The resolved same-origin URL |

The adapter supplies the router behavior, including history, scroll, route
state, and transitions. Choose authored versus resolved destinations according
to that router's contract; do not treat them as interchangeable.

Core's `onNavigate(intent)` runs synchronously before `navigate` and is an
observation callback. Its argument has no `preventDefault()` method. This
differs from Next Link's cancellable `onNavigate` event. Returning a value from
either core callback does not control navigation. Decide opt-outs before the
pointerdown is accepted.

Prefer the controller for integration. The lower-level `findAnchor` and
`resolveFastLink` functions do not supply controller lifecycle or follow-up
click handling on their own.

## React lifecycle

```tsx
'use client';

import { useFastLink } from '@fast-link/react';
import type { ReactNode } from 'react';

export function NavigationRegion({
  children,
  route,
}: {
  children: ReactNode;
  route: (url: URL) => void;
}) {
  const attach = useFastLink<HTMLDivElement>({
    navigate: ({ url }) => route(url),
  });
  return <div ref={attach}>{children}</div>;
}
```

The hook returns a stable callback ref and renders nothing itself. It accepts
core options plus `forwardedRef`, attaches a controller to the current root,
updates options after a React commit, and destroys the controller when the root
changes or unmounts. It attaches no controller during server rendering.

Pass the application's current navigation callback and caller ref into the hook.
Let it compose refs and cleanup rather than adding a second controller in an
effect. It preserves pending click suppression across option updates and runs
callback-ref cleanup when replacing a caller ref.

## Router or document navigation

Core's `runFastNavigation` can apply a synchronous policy, observe the selected
decision, and run either the adapter's route callback or document navigation.
The adapter supplies `defaultRouterDecision`; core does not infer router
ownership. Read [Routing decisions](routing.md) before using this helper.

Full API documentation is in the
[core README](https://github.com/vercel-labs/fast-link/tree/main/packages/core)
and [React README](https://github.com/vercel-labs/fast-link/tree/main/packages/react).
