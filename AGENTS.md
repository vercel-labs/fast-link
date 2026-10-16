# Fast Link agent instructions

Fast Link is a pnpm and Turborepo monorepo with three public packages.
Use `CONTEXT.md` for project terms and `docs/adr/` for accepted architecture
decisions.

When adding, changing, running, or interpreting benchmarks, read `docs/benchmarks.md`.

For writing, changing, or reviewing tests, and for test audits or cleanup, use
[the testing skill](.agents/skills/testing/SKILL.md).
When adding tests or changing test/CI configuration, follow
[Write and run tests](./CONTRIBUTING.md#write-and-run-tests).

- `packages/core` owns all eligibility, event ordering, click suppression, and
  cleanup behavior. It must not import React or Next.js.
- `packages/react` owns React ref lifecycle for core controllers. It depends
  on core and must not import Next.js.
- `packages/next` owns App Router Link and region navigation. It depends on
  core and the React package, and must not duplicate core eligibility or
  import private Next.js modules.
- Keep the production fixture on a pinned Next.js version within
  `packages/next`'s peer range.

## Runtime contracts

- `FastLinkIntent.href` is the authored attribute, `url` is the resolved
  same-origin destination, and `anchor` is the source element. Each framework
  adapter handles router-specific history, scroll, state, and transitions.
- `createFastLink` copies options. Adapters change configuration through
  `controller.update()`, which replaces every option without clearing a pending
  follow-up pointer click.
- Core accepts only primary mouse pointerdown. Touch and pen remain native
  because gesture intent is unknown when contact begins.
- Core prevents only the pointer-generated click that follows accepted
  navigation. Keyboard clicks remain native, and prevented clicks continue to
  propagate.
- Core marks accepted native events so nested roots and separately bundled core
  copies navigate once. Preserve both the symbol marker and local fallback.

Run commands from the repository root. Before considering a change complete,
run `pnpm validate` and inspect packed tarballs for every changed public
package. All commits must be signed.

After the initial release, changes to package source, build configuration,
shipped package files, or published manifest fields require a version bump and
a changelog entry at the top for each affected package. Test-only and
repository-only changes do not require a package release.

Release workflows use npm Trusted Publishing. Keep `id-token: write` scoped to
the publish job, pin GitHub Actions to full commit SHAs, and never add an npm
write token.
Only directories listed in `scripts/publishable-packages.json` can publish
through the release workflow. Keep the allowlist empty until npm Trusted
Publishing is configured.
