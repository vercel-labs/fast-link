# Core and React adapters

Read this for plain DOM integration or an application-owned navigation adapter.
For Next.js targets, first follow the [Next.js selection steps](next.md) to
identify the application entry point and supported integration.

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

Options are copied. Use `controller.update(allOptions)` to replace configuration
while preserving a pending follow-up click. Mutating the original options object
does not update the controller.

Use the public controller for eligibility, event ownership, cleanup, and
suppression; avoid parallel pointer/click listeners.

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

Core's `onFastNavigate` observes an intent; Next Link's `onNavigate` can cancel.
See the [core API reference](https://github.com/vercel-labs/fast-link/tree/main/packages/core#api-reference)
for options and the [event ordering guide](https://github.com/vercel-labs/fast-link/tree/main/packages/core#understand-event-ordering)
for callback ordering and failures.

## Iframes

- Load and initialize Fast Link inside each iframe it controls.
- A parent-document controller does not receive child-document events.
- Parent-loaded controllers attached to iframe elements are unsupported.

See the
[core iframe guide](https://github.com/vercel-labs/fast-link/tree/main/packages/core#initialize-inside-each-iframe)
for setup.

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
  return <div {...attach}>{children}</div>;
}
```

- Spread both `ref` and `onClickCapture` last on the same DOM element.
  A ref alone misses clicks stopped by descendant React capture handlers.
- Pass the caller's capture handler and ref into the hook for handler composition
  and ref cleanup.
- Pass the current navigation callback on each render. The hook preserves pending
  click suppression across committed option changes.

See the [React lifecycle contract](https://github.com/vercel-labs/fast-link/tree/main/packages/react#understand-the-hook-lifecycle)
for root replacement, unmount, and ref cleanup.

## Router or document navigation

Core's `runFastNavigation` can apply a synchronous policy, observe the selected
decision, and run either the adapter's route callback or document navigation.
The adapter supplies `defaultRouterDecision`; core does not infer router
ownership. Read [Routing decisions](routing.md) before using this helper.

Full API documentation is in the
[core README](https://github.com/vercel-labs/fast-link/tree/main/packages/core)
and [React README](https://github.com/vercel-labs/fast-link/tree/main/packages/react).
