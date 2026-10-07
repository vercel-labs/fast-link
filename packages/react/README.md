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

`useFastLink` returns a callback ref. Attach that ref to an anchor or an element
that contains anchors:

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
    <div ref={attach} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
```

Primary mouse navigation inside the region now calls `route` on `pointerdown`.
The intent provides the source anchor, its authored `href`, and a resolved
same-origin `URL`. The application decides how its router handles that intent.

The package renders no wrapper and imports no router. The `display: contents`
element in the example belongs to the application.

## `useFastLink` reference

```ts
function useFastLink<T extends HTMLElement = HTMLElement>(
  options: FastLinkOptions & {
    forwardedRef?: ForwardedRef<T>;
  },
): (element: T | null) => void;
```

| Option         | Type               | Default                                   | Behavior                                                            |
| -------------- | ------------------ | ----------------------------------------- | ------------------------------------------------------------------- |
| `enabled`      | `boolean`          | `true`                                    | Controls whether new pointerdowns can start navigation              |
| `navigate`     | `(intent) => void` | `window.location.assign(intent.url.href)` | Performs navigation after `onNavigate`; its return value is ignored |
| `onNavigate`   | `(intent) => void` | None                                      | Runs synchronously before `navigate`                                |
| `forwardedRef` | `ForwardedRef<T>`  | `null`                                    | Composes the caller's ref with the controller ref                   |

The returned callback ref is stable. Use it on an anchor or containing
`HTMLElement`.

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
