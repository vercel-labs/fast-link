---
name: fast-link
description: Integrate, migrate, troubleshoot, or review Fast Link when it is named or the project uses or is adopting @fast-link/next, @fast-link/react, or @fast-link/core. General navigation performance requests alone are outside this skill's scope.
license: MIT
---

# Fast Link

Fast Link starts eligible mouse navigation on pointerdown. Use it for ordinary,
immediately reversible navigation where pressing the link is enough to commit.

## Inspect the consumer

Read the project's manifest, lockfile, link components, routing configuration,
and relevant handlers before choosing an integration. Check the selected
package's public exports, peer dependencies, and runtime requirements. The
installed version takes precedence over examples in this skill. If the package
is absent, resolve a compatible version before adding it for implementation
work; advice and reviews do not require dependency changes.

Identify the navigation region, existing guards, per-link options, base path,
and which destinations the application's router handles. Follow application
wrappers to their rendered anchors and handlers. Establish these facts from
code; ask only for decisions the project does not resolve.

## Decide where early navigation fits

Leave release-sensitive interactions native: confirmations, purchases,
destructive actions, forms, and links whose drag-to-bookmark behavior matters.
A same-origin URL can belong to another application; origin alone does not
establish router ownership.

Inspect click-time behavior before wrapping existing links. A region's capture
listener can navigate before an ordinary link's `onClick` or `onNavigate` runs.
Use `data-no-fast-link` on that anchor to retain its normal behavior. Use a
managed `FastLink` when the existing behavior can run synchronously on press
and its Next.js options should be preserved. Do not move a release-time guard
earlier without agreement that the timing change fits the interaction.

## Choose the interface

| Consumer need                                               | Interface                               | Read                                                                                |
| ----------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------- |
| Next.js App Router links sharing one navigation policy      | `FastLinkRegion` from `@fast-link/next` | [Next.js integration](references/next.md)                                           |
| A Next.js link with its own routing options or cancellation | `FastLink` from `@fast-link/next`       | [Next.js integration](references/next.md)                                           |
| An application-owned Next.js link renderer                  | `useFastLink` from `@fast-link/next`    | [Next.js integration](references/next.md)                                           |
| Plain DOM navigation or a non-React adapter                 | `createFastLink` from `@fast-link/core` | [Core and React adapters](references/adapters.md)                                   |
| React lifecycle for an application-owned navigation adapter | `useFastLink` from `@fast-link/react`   | [Core and React adapters](references/adapters.md)                                   |
| Same-origin destinations handled by different applications  | Application-supplied `navigationPolicy` | [Routing decisions](references/routing.md), plus the relevant integration reference |

Choose the narrowest region whose links share a policy. The React package
supplies lifecycle, not a Next.js router. The Next.js package supports the App
Router; inspect other router integrations before proposing a custom adapter.

## Preserve input and event behavior

- Core accepts primary mouse presses. Touch, pen, keyboard activation, modified
  clicks, downloads, external URLs, non-`_self` targets, hash-only links, and
  presses on nested controls stay on their normal path.
- After accepted early navigation, the follow-up pointer click is
  default-prevented but still propagates. Click handlers may run if the elements
  remain mounted; navigation can unmount them before release. A drag away can
  navigate without producing a click. Required work cannot depend on that click.
- A managed anchor owns its interaction before containing regions, including
  when its controller is disabled. Nested regions use outer-first capture
  ordering, not nearest-region priority.
- Put `data-no-fast-link` on the anchor or the descendant where a press starts.
  It is not an ancestor-wide switch. Use `enabled={false}` to disable a region's
  handling of its ordinary links.

Keep the browser and framework responsible for native activation. Use the
package's controller or hook instead of adding parallel pointer/click listeners
or duplicating eligibility checks.

## Implement or review, then verify

Preserve existing rendering, semantics, refs, routing options, and unrelated
handlers. For a review, report defects with their location and behavioral
impact; change code only within the requested scope.

Run the consumer's relevant checks. For changed integrations, verify:

- Mouse navigation begins on press and the follow-up click does not navigate
  twice; keyboard and modified activation retain their normal behavior.
- Guards, opt-outs, and disabled managed links remain effective inside regions.
- History, scroll, base paths, and routing across applications match the
  application's requirements when those features are present.
- Custom refs and controllers survive committed option changes and clean up
  when the root changes or unmounts.

Check critical navigation in the real application when available; mocked router
tests alone do not establish production routing behavior. Report the changed
scope, the checks actually run, and any untested browser or router behavior.
