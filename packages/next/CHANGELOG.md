# @fast-link/next

## 0.0.6

Reorganize the package documentation from installation and interface selection
through API reference, routing policies, and custom renderers. Runtime behavior
is unchanged.

## 0.0.5

Add application-owned navigation policies and the useFastLink custom-renderer
hook. Share decision sequencing with core, preserve Link router options, and
allow managed links to own their presses inside Regions.

Separate the Link, Region, hook, and policy contracts into dedicated folders
with colocated tests. Keep the package entry point limited to named exports;
public imports and behavior are unchanged.

## 0.0.4

Add `FastLinkRegion` for existing links and move the shared controller lifecycle
to `@fast-link/react`. Both Next components now attempt routing even if
`onFastNavigate` throws.

## 0.0.3

Commit FastLink navigation options and forwarded refs in one layout update.

## 0.0.2

Preserve follow-up click suppression when forwarded refs change during rerenders.

## 0.0.1

Initial App Router `FastLink` release.
