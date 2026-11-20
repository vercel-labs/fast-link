# Core and React adapters

Read this for plain DOM integration or an application-owned navigation adapter.
For Next.js targets, first follow the [Next.js selection steps](next.md) to
identify the application entry point and supported integration.

## Plain DOM

```ts
import { createLinkInteraction } from '@fast-link/core';

export function attachNavigation(root: HTMLElement) {
  const controller = createLinkInteraction(root, {
    mode: 'immediate',
    navigate: ({ url, anchor }) =>
      anchor.ownerDocument.defaultView?.location.assign(url.href),
  });
  return () => controller.destroy();
}
```

Attach to an anchor or the narrowest containing element that shares a policy.
`createLinkInteraction` requires a mode and has no default navigation: pass
`navigate` for immediate mode. Call `destroy()` when the root is no longer
used; repeated destruction is harmless.

For release mode, pass `prepare` and accept the click in a click-capture
listener:

1. `matchClick(event)`
2. Run the synchronous guards.
3. `consume()`
4. On a result, call `preventDefault()` and navigate.
5. Call `discard()` in `finally`.

See the [core release example](https://github.com/vercel-labs/fast-link/tree/main/packages/core#navigate-on-the-accepted-click).
Native mode needs no callbacks. A region registers in every mode, and an
ordinary link uses its closest region.

Options are copied. Use `controller.update(allOptions)` to replace
configuration, including the mode, while preserving a pending follow-up click.
Mutating the original options object does not update the controller.

`createFastLink` was removed in 0.1.0. Replace it with immediate mode as above,
and `enabled: false` with `{ mode: 'native' }`.

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

In immediate mode, `beforeNavigate(intent)` runs before `navigate` and can
cancel by returning `false`; the follow-up click stays suppressed either way.
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

import { useLinkInteraction } from '@fast-link/react';
import type { ReactNode } from 'react';

export function NavigationRegion({
  children,
  route,
}: {
  children: ReactNode;
  route: (url: URL) => void;
}) {
  const binding = useLinkInteraction<never, HTMLDivElement>({
    mode: 'immediate',
    navigate: ({ url }) => route(url),
  });
  return (
    <div ref={binding.ref} onClickCapture={binding.suppressClick}>
      {children}
    </div>
  );
}
```

- Attach `ref` and call `suppressClick` from `onClickCapture` on the same DOM
  element. A ref alone misses clicks stopped by descendant React capture
  handlers. Run the caller's capture handler after `suppressClick`.
- Pass `forwardedRef` for ref composition and cleanup.
- Pass the current options on each render. The hook keeps the element and
  controller across mode changes and preserves pending click suppression.
- React `useFastLink` was removed in 0.1.0; replace it with this pattern.

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
