# Separate DOM behavior, React lifecycle, and Next routing

Fast Link publishes three packages so adapters share interaction behavior
without requiring every caller to use React or Next.js.

- `@fast-link/core` owns link eligibility, capture listeners, event
  deduplication, follow-up click suppression, and controller cleanup. It also
  runs navigation decisions without importing a framework.
- `@fast-link/react` binds a core controller to a React-owned element through a
  callback ref. It composes caller refs, applies committed options, and cleans
  up when the root changes or unmounts. It renders no wrapper and imports no
  router.
- `@fast-link/next` constructs App Router destinations and provides `FastLink`,
  `FastLinkRegion`, and `useFastLink` for custom renderers. It depends on both
  packages and uses core's eligibility rules.

Router destinations, history, scroll, and transitions belong to adapters.
Applications determine router ownership. Core can execute a navigation
decision without knowing the application's routes or framework.

The separate React package keeps controller and ref lifecycle in one place.
Adapters update the existing controller when options change, preserving a
pending follow-up click across rerenders. Implementing this lifecycle in each
adapter would duplicate the same cleanup and update rules.

Implementation: [DOM controller](../../packages/core/src/controller/index.ts#L43),
[React binding](../../packages/react/src/use-fast-link/index.ts#L64), and
[Next hook](../../packages/next/src/use-fast-link/index.ts#L45).
