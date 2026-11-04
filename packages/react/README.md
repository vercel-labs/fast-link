# ▲ @fast-link/react

`useClickPreparation` binds core preparation to a React-owned anchor or region.
It owns committed options, refs, and teardown. Your adapter owns click guards,
default prevention, and routing. For App Router applications, use
[`@fast-link/next`](https://github.com/vercel-labs/fast-link/tree/main/packages/next).

## Requirements

Node.js 22 or later and React 19 (`>=19 <20`).

## Install the package

```sh
npm install @fast-link/react
```

The [Fast Link agent skill](https://github.com/vercel-labs/fast-link#agent-skill)
is included at `skills/fast-link/SKILL.md`.

## Bind preparation to a React region

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

This example accepts at bubble time after child handlers. Adapters choose an
acceptance point that preserves their framework's guards. Supply speculative
work through `prepare(intent)`; it must not navigate.

## `useClickPreparation` reference

`useClickPreparation<P, T>(options)` accepts `enabled`, `prepare(intent)`, and
an optional `forwardedRef`. It returns stable `{ ref, matchClick, discard }`
bindings and renders no wrapper.

Attach `ref` to the controlled root and pass `event.nativeEvent` to `matchClick`
before synchronous guards. Call the returned candidate's `consume()` after
acceptance or `discard()` on cancellation, errors, or a native framework path.
Always finalize the candidate during the same click dispatch. See the
[core contract](https://github.com/vercel-labs/fast-link/tree/main/packages/core#createclickpreparation)
for eligibility, matching, cancellation, and preparation errors.

## Understand the hook lifecycle

- Attaching the ref creates the controller. Reattaching to the same DOM element
  within a commit preserves its gesture. Root replacement and component unmount
  destroy the controller; a detached ref with no replacement is cleared after
  the commit. Matching and consumption reject a root that remains detached.
- Committed options replace the controller's copied options. Valid preparation
  survives updates; disabling discards the gesture.
- Caller-ref replacement runs the old cleanup before assigning the new ref.
  Callback cleanup functions and object refs are supported.
- Server rendering attaches no controller. Preparation causes no React state update.
- A region controls its DOM subtree. React ancestry does not extend its scope
  across portals or shadow roots.

The package exports only `useClickPreparation`. There is no press-navigation
binding or compatibility alias.
