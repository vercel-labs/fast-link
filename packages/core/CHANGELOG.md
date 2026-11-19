# Changelog

## 0.1.0

- Add `createClickPreparation` to prepare on eligible mouse press and return a
  once-only candidate for the matching click. Adapters accept the candidate,
  prevent the click, and navigate. New input, cancellation, dragging, release
  away, blur, disabling, and destruction discard the gesture.
- Add `validateFastNavigationDecision` to check a policy result without
  navigating or observing.

## 0.0.2

- Bundle the canonical Fast Link agent skill, references, and agent metadata at
  `skills/fast-link/` in the npm package.

## 0.0.1

- Initial public release of the framework-independent controller for early
  same-origin mouse navigation, with shared eligibility checks, follow-up click
  suppression, and explicit cleanup.
