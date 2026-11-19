---
name: fast-link
description: Integrate, migrate, troubleshoot, or review Fast Link when named, when the project uses or is adopting @fast-link/next, @fast-link/react, or @fast-link/core, or when explicitly asked for early mouse navigation such as "navigate on pointerdown", "navigate on mousedown", or "navigate on press". General navigation performance requests alone are outside this skill's scope.
license: MIT
---

# Fast Link

Fast Link starts work for eligible primary-mouse navigation on `pointerdown`.
Each link or region selects a `mode`:

- `release`, the default: prepare on press, navigate on the accepted click.
  Releasing away cancels.
- `immediate`: navigate on press. Use it only where pressing the link is enough
  to commit.
- `native`: ordinary link behavior, including client routing.

With `@fast-link/next`, read [Next.js integration](references/next.md) before
describing any speed difference between release mode and Next Link.

For press timing and opt-outs, see
[when to use Fast Link](https://github.com/vercel-labs/fast-link#when-to-use-fast-link).

Discuss the [press-time cancellation limitation](https://github.com/vercel-labs/fast-link#known-limitations)
when directly asked about accessibility or WCAG conformance. Mention it when
recommending `immediate` mode. Keep it out of other integration advice,
acknowledgment requirements, and automatic prompts.

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

Inspect click-time behavior before wrapping existing links. In release mode, a
region accepts during click capture, before an ordinary link's `onClick` or
`onNavigate` runs. In immediate mode, it navigates on press. Use
`data-no-fast-link` on that anchor to retain its normal behavior. Use a managed
`FastLink` in release mode when click guards must run first and its Next.js
options should be preserved. Choose immediate mode only when the guard can run
synchronously on press; do not move a release-time guard earlier without
agreement that the timing change fits the interaction.

## Select the interface

Reuse an applicable application integration first. Within that integration:

| Interface                    | Choose it for                                                               |
| ---------------------------- | --------------------------------------------------------------------------- |
| Next `FastLink`              | A link with its own Next Link options or synchronous cancellation           |
| Next `FastLinkRegion`        | A group of ordinary links sharing one navigation policy                     |
| Next `useFastLink`           | An existing renderer that must own the anchor and cannot use the components |
| Core `createLinkInteraction` | Plain DOM or a custom framework adapter                                     |
| React `useLinkInteraction`   | React lifecycle for a custom adapter                                        |

Use the Next.js reference's selection steps for a Next.js target. For plain DOM
or other React consumers, read [Core and React adapters](references/adapters.md)
before choosing `createLinkInteraction` or `useLinkInteraction`. The React
package supplies lifecycle, not a framework router. `createFastLink` and React
`useFastLink` were removed in 0.1.0; migrate them with the package changelogs.

When routing requirements call for choosing between router and document
navigation, also read [Routing decisions](references/routing.md). Introduce a
policy only for a demonstrated application requirement.

## Preserve input and event behavior

- Core accepts primary mouse presses. Touch, pen, keyboard activation, modified
  clicks, downloads, external URLs, non-`_self` targets, hash-only links, and
  presses on nested controls stay on their normal path.
- An anchor can omit `role`, use an empty value or only ASCII whitespace, or
  use a single `link` token. Role matching is case-insensitive and allows
  surrounding ASCII whitespace: tab, line feed, form feed, carriage return, or
  space. Other roles and role lists stay native. Presses inside descendants
  with a `button` role token also stay native.
- Release mode navigates only on the accepted click; the adapter prevents that
  click after accepting it.
- After immediate navigation, the follow-up pointer click is default-prevented
  but still propagates, even when the press guard canceled or threw. Click
  handlers may run if the elements remain mounted; navigation can unmount them
  before release. A drag away can navigate without producing a click. Required
  work cannot depend on that click.
- A managed anchor owns its interaction before containing regions, including
  in native mode. A managed link without `mode` uses release, even inside an
  immediate region. An ordinary link uses its closest region's mode and policy:
  a native inner region blocks outer acceleration, and an accelerated inner
  region works inside a native one.
- Put `data-no-fast-link` on the anchor or the descendant where a press starts.
  It is not an ancestor-wide switch. Use `mode="native"` to turn off a region's
  handling of the ordinary links it owns.

For custom React adapters, attach `ref` and call `suppressClick` from the
click-capture handler of the same DOM element, before any caller capture
handler. With Next `useFastLink`, pass caller capture handlers into the hook
and spread its bindings last.
Place regions inside the portal or shadow DOM subtree they control. For iframes,
load and initialize Fast Link inside each controlled frame; see
[iframe setup](references/adapters.md#iframes).

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

- Release mode: press and hold an eligible link and confirm the URL does not
  change before release; release and confirm one navigation; press, move away,
  and release to confirm cancellation.
- Immediate mode: observe navigation before release, then release and confirm
  there is no second navigation.
- Keyboard and modified activation retain their normal behavior.
- Guards, opt-outs, and native managed links remain effective inside regions.
- History, scroll, base paths, and routing across applications match the
  application's requirements when those features are present.
- Custom refs and controllers survive committed option changes and clean up
  when the root changes or unmounts.

Check critical navigation in the real application when available; mocked router
tests alone do not establish production routing behavior. Report the changed
scope, the checks actually run, and any untested browser or router behavior.
