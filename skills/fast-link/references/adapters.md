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

Use `controller.update(allOptions)` to replace configuration while preserving a
pending follow-up click. Use the public controller for eligibility, event
ownership, cleanup, and suppression; avoid parallel pointer/click listeners.

The adapter chooses authored `intent.href` versus resolved `intent.url` according
to its router's contract and supplies history, scroll, state, and transitions.
Core's `onFastNavigate` observes an intent; Next Link's `onNavigate` can cancel.
See the [core API reference](https://github.com/vercel-labs/fast-link/tree/main/packages/core#api-reference)
for options and the [event ordering guide](https://github.com/vercel-labs/fast-link/tree/main/packages/core#understand-event-ordering)
for callback ordering and failures.

## Iframes

Load and initialize Fast Link inside each iframe it controls. A controller on
the parent document does not receive child-document events. Loading Fast Link
in the parent document and attaching its controllers to elements inside an
iframe is unsupported. See the
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

Forward both `ref` and `onClickCapture` to the same DOM element and spread them
last. Pass the caller's capture handler and ref into the hook so it can preserve
click suppression and ref cleanup. A ref alone cannot suppress clicks stopped
by descendant React capture handlers. Pass the application's current navigation
callback on each render; the hook preserves pending suppression across
committed option changes.
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
