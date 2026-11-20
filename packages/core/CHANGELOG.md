# Changelog

## 0.1.0

- Add `createLinkInteraction` and `LinkMode`. One controller per root handles
  eligible mouse input in an explicit `release`, `immediate`, or `native` mode
  and keeps its identity across mode changes. Native mode needs no callbacks.
  An optional `isActive` argument leaves presses native and rejects activation
  while it returns `false`.
- Immediate mode arms follow-up click suppression before its `beforeNavigate`
  guard, then navigates with current inputs. Suppression survives mode, option,
  and `href` changes and settles on its click, the next press at the root, or
  destruction. Leaving release mode discards preparation without navigating.
- Link interaction roots use the closest region for ordinary links, including
  native regions; managed anchors keep priority over every region.
- Add `createClickPreparation` to prepare in the task after an eligible mouse
  press and return a once-only candidate for the matching click. A discarded,
  inactive, or no-longer-owned gesture never calls `prepare`; a click matched
  before then gets `prepared: null`. Adapters accept the candidate, prevent the
  click, and navigate. New input, cancellation, dragging, release away, blur,
  disabling, and destruction discard the gesture. It accepts the same optional
  `isActive` argument.
- Add `validateFastNavigationDecision` to check a policy result without
  navigating or observing.
- Remove `createFastLink` and its `FastLinkController` and `FastLinkOptions`
  types. Migrate to `createLinkInteraction(root, { mode: 'immediate', navigate })`,
  which also navigates on press:
  - `navigate` is required. For the earlier document default, pass
    `({ url, anchor }) => anchor.ownerDocument.defaultView?.location.assign(url.href)`.
  - `onFastNavigate` is removed. Observe inside `navigate`, for example
    `navigate: (intent) => { try { observe(intent); } finally { route(intent); } }`
    so navigation still runs if observation throws. Use `beforeNavigate` only
    to cancel: navigation does not run when it returns `false` or throws.
  - Replace `enabled: false` with `{ mode: 'native' }`, at creation or in
    `update()`.
  - `suppressClick` now returns whether it suppressed the click.
  - Nested regions now use the closest region for ordinary links instead of
    the outermost one.

## 0.0.2

- Bundle the canonical Fast Link agent skill, references, and agent metadata at
  `skills/fast-link/` in the npm package.

## 0.0.1

- Initial public release of the framework-independent controller for early
  same-origin mouse navigation, with shared eligibility checks, follow-up click
  suppression, and explicit cleanup.
