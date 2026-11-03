# Changelog

## 0.0.3

- Prepare managed `FastLink` on eligible press and navigate after click guards.
  Require pure, repeatable policies; move effects to navigation callbacks.
- Recheck committed policy, guards, and routing options before accepting a click.
- Support experimental preparation on Next `16.5.0-canary.37`; fall back at click
  when preparation is unavailable. Region and custom-hook timing is unchanged.
- Update the core and React dependencies to `^0.0.3`.

## 0.0.2

- Bundle the canonical Fast Link agent skill, references, and agent metadata at
  `skills/fast-link/` in the npm package.
- Update the core and React dependencies to `^0.0.2`.

## 0.0.1

- Initial public release of `FastLink`, `FastLinkRegion`, and `useFastLink` for
  Next.js App Router navigation, with per-link routing options and
  application-owned navigation policies.
