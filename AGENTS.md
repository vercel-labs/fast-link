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

When changing a public contract, review affected package and root READMEs and
`skills/fast-link/` references against the source, and update stale guidance.

## Script organization

When adding or moving a script, place it in the existing group that owns its
responsibility. Keep related helpers, tests, and fixtures with that group.
Create a new group when a distinct responsibility has multiple related files.
A single script unrelated to existing groups may stay directly under `scripts/`.

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
  copies navigate once. Preserve both the symbol marker and shared `WeakSet` fallback.

## Verification

Run commands from the repository root. Before considering a change complete,
run `pnpm validate`. For every changed public package, build on Node.js 24 and
inspect its packed tarball:

```sh
pnpm build
node scripts/packaging/prepare-package-artifacts.mjs <directory> <full-commit-sha>
node scripts/packaging/test-packed-consumers.mjs <directory> <full-commit-sha>
```

Use the full commit SHA as `gitHead`. Preparation inspects package contents and
writes archive identities and SHA-256 digests to `release-artifacts.json`.
Run the consumer command under each supported Node.js version against that same
archive directory.

All commits must be signed.

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

## CI

- `scripts/ci/select-ci-paths.sh` selects lighter PR checks only for non-empty diffs
  where every path is root `*.md`, `docs/**/*.md`, or `skills/fast-link/**`.
- Lightweight PRs run formatting and package release intent. They skip
  boundaries, lint, builds, types, tests, size, packing, browser, and packed
  consumers.
- Other diffs run full CI. Path-detection failure fails validation. Local
  `pnpm validate` always runs the full checks.
- Change allowed paths in the script and `scripts/ci/select-ci-paths.spec.mjs`.
  Change selected checks in `.github/workflows/ci.yml`. After either change,
  run `pnpm validate` and inspect the PR's GitHub Actions results.
