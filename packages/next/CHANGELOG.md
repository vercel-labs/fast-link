# Changelog

## 0.1.0

- Add `mode` to `FastLink`, `FastLinkRegion`, and `useFastLink`, and export
  `LinkMode`. `release`, the default, prepares right after press and navigates on
  an accepted click. `immediate` navigates on press. `native` leaves navigation
  to Next Link.
- Replace the `enabled` prop with `mode`. Migrate `enabled={false}` to
  `mode="native"`. Earlier versions navigated on press: use
  `mode="immediate"`, or `mode={enabled ? 'immediate' : 'native'}`, to keep
  that timing.
- In release mode, `FastLink` navigates after the caller's `onClick`, Next
  Link's checks, and the caller's `onNavigate`. Regions and the custom hook
  accept during click capture, after their supplied guards; later child click
  handlers cannot veto the navigation.
- In immediate mode, the supplied `onNavigate` runs before policy and
  navigation. The follow-up click stays prevented even when `onNavigate`
  cancels or throws.
- An ordinary link uses its closest region's mode and policy, including a
  native region or a DOM `createLinkInteraction` region. Managed links keep
  their own mode inside every region.
- Prepare through Next's experimental `experimental_prepare` when available,
  and only when the current policy selects router navigation. A prepared
  navigation is reused only for the same router and destination with current
  commit options. Missing or failed preparation falls back to click-time
  routing. A failed navigation is never retried.
- Start release preparation in the task after an eligible press, not inside the
  `pointerdown` handler. A click accepted before then routes without
  preparation. A discarded gesture calls neither the policy nor
  `experimental_prepare`.
- Policies must be pure and repeatable: release mode can call them after press
  and again on click.
- Receive `FastLink` refs through React 19's `ref` prop.
- Remove these props and options, with their replacements:
  - `as` and `legacyBehavior` on `FastLink`: render the link with plain
    `next/link`, and add `data-no-fast-link` when it sits inside a region.
  - Optional `href` on `useFastLink`: always pass `href`.
  - Non-anchor roots and the element type parameter on `UseFastLinkOptions`:
    attach the returned `ref` to the renderer's anchor. `forwardedRef` and
    `onClickCapture` are typed for `HTMLAnchorElement`.
- Widen the Next peer range to `>=16 <17 || 16.5.0-canary.42`. The canary
  provides the experimental `router.experimental_prepare` API that release mode
  uses after press; it requires `experimental: { prepareNavigation: true }` in
  `next.config`. On other Next versions, release mode does not prepare and
  routes at the accepted click.
- Update the core and React dependencies to `^0.1.0`.

## 0.0.2

- Bundle the canonical Fast Link agent skill, references, and agent metadata at
  `skills/fast-link/` in the npm package.
- Update the core and React dependencies to `^0.0.2`.

## 0.0.1

- Initial public release of `FastLink`, `FastLinkRegion`, and `useFastLink` for
  Next.js App Router navigation, with per-link routing options and
  application-owned navigation policies.
