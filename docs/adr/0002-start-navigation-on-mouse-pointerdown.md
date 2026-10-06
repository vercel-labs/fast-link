# Start navigation on primary mouse pointerdown

Fast Link starts eligible same-origin navigation on primary mouse `pointerdown`
rather than waiting for `click`. This removes the wait for release and gives up
release-time cancellation for those interactions.

For touch and pen, `pointerdown` cannot establish whether contact will become a
tap, scroll, swipe, drag, zoom, or long press. A later `pointercancel` cannot undo
navigation that has already started. Waiting for `pointerup` gives up the early
navigation benefit, so touch and pen keep native activation.

- Keyboard activation, modified clicks, and links that require native handling
  stay on their normal path. Core applies the same eligibility rules to every
  adapter.
- The follow-up pointer click is default-prevented without stopping
  propagation. Click handlers can still run if their elements remain mounted,
  but cannot cancel navigation that has already started. Keyboard clicks are
  not suppressed.
- A mouse press can navigate even if the user then drags away without producing
  a click. Use `data-no-fast-link` for links whose behavior depends on release
  or on dragging the URL.

Implementation: [eligibility](../../packages/core/src/interaction/index.ts#L31)
and [click suppression](../../packages/core/src/controller/index.ts#L68).
The [browser tests](../../packages/core/src/controller/index.browser.test.ts#L7)
check navigation timing and click propagation.
