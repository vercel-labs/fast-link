# Changelog

## 0.0.3

- Prepare all integrations on press and navigate at accepted click. `FastLink`
  accepts after Next guards; regions and custom hooks accept during click capture.
- Require pure, repeatable policies. Read current policy and commit options after guards.
- Reuse preparation by router and destination; callback identity does not invalidate it.
- Remove `as`, `legacyBehavior`, optional-href, and non-anchor custom-hook support.
- Use experimental preparation on Next `16.5.0-canary.37`; fall back at accepted
  click when preparation is unavailable or fails. Never retry a failed commit.
- Update core and React dependencies to `^0.0.3`.

## 0.0.2

- Bundle the canonical Fast Link agent skill, references, and agent metadata at
  `skills/fast-link/` in the npm package.
- Update the core and React dependencies to `^0.0.2`.

## 0.0.1

- Initial public release of `FastLink`, `FastLinkRegion`, and `useFastLink` for
  Next.js App Router navigation, with per-link routing options and
  application-owned navigation policies.
