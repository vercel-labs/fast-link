# Fast Link

Fast Link starts work for eligible mouse link navigation on press, while other
interactions keep their native behavior.

## Language

**Fast Link**:
The project name for early mouse link navigation.
_Avoid_: Mousedown Nav, Mouse Down Nav

**Eligible interaction**:
A primary mouse press on a same-origin link that does not require native
browser handling.
_Avoid_: Safe click, valid click

**Fast Link intent**:
An accepted link interaction described by its source anchor, authored `href`,
and resolved same-origin URL.
_Avoid_: Route, click event

**Navigation adapter**:
An integration that maps a Fast Link intent to document navigation or a client
router.
_Avoid_: Router integration, navigation hook

**FastLink**:
The Next.js App Router link component with per-link Fast Link behavior and
navigation options.
_Avoid_: NextFastLink, FastLink Link

**FastLinkRegion**:
A Next.js App Router component that applies one navigation policy to ordinary
links in its subtree. Managed links retain their own navigation options.
_Avoid_: Fast Link nav, Mousedown Nav

**Managed link**:
An anchor configured for per-link Fast Link behavior, including when early
navigation is disabled.
_Avoid_: Region link

**Ordinary link**:
An anchor with no per-link Fast Link behavior. A containing region can supply
its early navigation policy.
_Avoid_: Managed link

**Anchor ownership**:
A managed link's priority over containing regions for its interactions.
_Avoid_: Router ownership

**Region ownership**:
An ordinary link's closest link interaction region supplies its mode and
navigation policy, including native mode.
_Avoid_: Outer-first priority, inherited mode

**Release mode**:
Fast Link behavior that prepares on an eligible mouse press and navigates on an
accepted click. Releasing away cancels activation.
_Avoid_: Pointerup mode, prepared mode

**Immediate mode**:
Fast Link behavior that navigates on an eligible mouse press, before release.
Later release or click cancellation cannot reverse that navigation.
_Avoid_: Fastest mode, safe mode

**Native mode**:
The mode that turns off a root's acceleration and leaves navigation to ordinary
link behavior. It does not force a full-page reload.
_Avoid_: Disabled link, document navigation

**Preparation**:
Work started for a possible destination before navigation is accepted.
Preparation alone does not navigate.
_Avoid_: Navigation, completed page load

**Accepted click**:
A matching click that passes the guards available to its Fast Link
integration. Later handlers cannot undo navigation already accepted by that
integration.
_Avoid_: Pointerup, any release

**Follow-up click**:
The pointer-generated click associated with an accepted Fast Link interaction.
_Avoid_: Synthetic click, duplicate click

**Router ownership**:
The application's classification of whether its current client router can
handle a destination: owned, foreign, or unknown.
_Avoid_: Same-zone, internal URL

**Router proposal**:
An adapter's proposed client-router destination, history method, and scroll
behavior.
_Avoid_: Redirect, routing configuration

**Navigation policy**:
An application-defined rule that chooses a navigation decision for a Fast Link
intent and router proposal.
_Avoid_: Redirect callback, ownership detector

**Navigation decision**:
A choice between the proposed router navigation and document navigation to the
validated destination, with an optional router scroll override.
_Avoid_: Navigation result, route override
