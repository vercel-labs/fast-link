---
name: fast-link
description: Integrate, migrate, troubleshoot, or review Fast Link when named, when the project uses or is adopting @fast-link/next, @fast-link/react, or @fast-link/core, or when explicitly asked for early mouse navigation such as "navigate on mousedown" or "navigate on press". General navigation performance requests alone are outside this skill's scope.
license: MIT
---

# Fast Link

Fast Link starts eligible primary-mouse navigation on `pointerdown`. Use it
where pressing the link is enough to commit. For press timing and opt-outs, see
[when to use Fast Link](https://github.com/vercel-labs/fast-link#when-to-use-fast-link).

## Inspect the consumer

Inspect the relevant package manifests, lockfile entries, link components,
routing configuration, and handlers before choosing an integration. Check the selected
package's public exports, peer dependencies, and runtime requirements. The
installed version takes precedence over examples in this skill. If the package
is absent, resolve a compatible version before adding it for implementation
work; advice and reviews do not require dependency changes.

Trace the target links through aliases, export barrels, and shared packages to
their rendered anchors and handlers. Find existing Fast Link components,
regions, hooks, and policies, then verify which belong to the target application.
Reuse an applicable integration before adding another or importing the library
at a consumer. Inspect affected consumers before extending a shared integration.

Establish the navigation region, guards, per-link options, base path, and router
ownership from code. Keep this inspection bounded to the requested scope and
its dependencies; ask only for information or decisions the project cannot resolve.

For a Next.js target, read [Next.js integration](references/next.md) before
selecting imports or changing an integration, including adoption, migration,
troubleshooting, and review. This applies when links arrive through application
aliases or shared libraries as well as direct Next Link imports.

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

## Select the interface

Reuse an applicable application integration first. Within that integration:

| Interface             | Choose it for                                                               |
| --------------------- | --------------------------------------------------------------------------- |
| Next `FastLink`       | A link with its own Next Link options or synchronous cancellation           |
| Next `FastLinkRegion` | A group of ordinary links sharing one navigation policy                     |
| Next `useFastLink`    | An existing renderer that must own the anchor and cannot use the components |
| Core `createFastLink` | Plain DOM or a custom framework adapter                                     |
| React `useFastLink`   | React lifecycle for a custom adapter                                        |

Use the Next.js reference's selection steps for a Next.js target. For plain DOM
or other React consumers, read [Core and React adapters](references/adapters.md)
before choosing `createFastLink` or React's `useFastLink`. The React package
supplies lifecycle, not a framework router.

When routing requirements call for choosing between router and document
navigation, also read [Routing decisions](references/routing.md). Introduce a
policy only for a demonstrated application requirement.

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

For custom React adapters, forward both hook bindings (`ref` and
`onClickCapture`) to the same DOM element. Pass caller capture handlers into the
hook and spread its bindings last to retain suppression and handler composition.
Place regions inside the portal or shadow DOM subtree they control.

Keep the browser and framework responsible for native activation. Use the
package's controller or hook instead of adding parallel pointer/click listeners
or duplicating eligibility checks.

## Implement or review, then verify

Preserve existing rendering, semantics, refs, routing options, and unrelated
handlers. For a review, report defects with their location and behavioral
impact; change code only within the requested scope.

Before implementation, identify the import path, Fast Link primitive, routing
authority, and required opt-outs. Explain that choice
with source evidence; keep uncertain links native until their contract is known.

Run the consumer's existing install, typecheck, build, and browser checks as
applicable. Derive commands from its package scripts and configuration. Verify:

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
