---
name: testing
description: Write, change, or review Fast Link tests, choose between specs, browser tests, and real app fixtures, or audit and clean up test suites. Use when assessing test value, duplication, reliability, or coverage in this repository.
---

# Fast Link testing

Protect observable contracts with the smallest maintainable test surface.
Adapted from Eve's
[test-audit](https://github.com/vercel/eve/blob/e3cea42486e7e32b7b3001bb5912e076b5443ad5/.agents/skills/test-audit/SKILL.md).

- For audits or cleanup, read [Audit and cleanup](references/audit.md).
- Apply the shared rules below to authoring and auditing.

## Authoring gate

Inspect the production owner, callers, and neighboring tests. State:

- **Contract:** observable inputs and outcomes, with source evidence.
- **Regression:** name a production fault and trace the exact assertion it breaks.
- **Placement:** the test layer and failure existing tests cannot catch.

Keep exhaustive cases with their owner:

- **Core:** eligibility, event ordering, click suppression, cleanup.
- **React:** refs and controller lifecycle.
- **Next:** Link and region adaptation to App Router.
- Test adapter failures without replaying core's eligibility matrix.
- Keep observable ordering and counts that detect early or duplicate navigation, or broken cleanup.

## Choose the surface

- Use the cheapest layer that exposes the regression.
- Read package scripts, Vitest configs, and `turbo.json` for environments and build prerequisites.
- Give each contract one primary test owner. Additional layers need a distinct failure to catch.
- Example: a spec checks the router's `replace` argument; a production fixture checks back-stack behavior.

### Specs

- Prove decisions, controller state, adapter arguments, React rerenders, and cleanup.
- Colocate `*.test.ts` / `*.test.tsx` with the owner; root tooling uses `scripts/*.spec.mjs`.
- Package specs use Vitest's `unit` project in jsdom. Synthetic events prove supplied-event handling, not native activation.

### Browser tests

- Prove native targeting, capture/bubbling, trusted press/release sequences, default navigation, and browser differences.
- `scripts/test-core-targeting.mjs` tests built core with named `node:test` cases in Chromium, Firefox, and WebKit.
- Use browser input for native activation claims; `dispatchEvent` remains synthetic in a browser.
- Keep cases whose browser boundary adds proof.

### Real app fixtures

- Prove actual Next Link/router behavior, hydration, history, scroll, base paths, prefetch, and composed navigation.
- Extend `fixtures/next-16` and `scripts/test-next-fixtures.mjs`; keep the production app pinned.
- Router mocks cannot establish real framework behavior.
- Preserve `fixtures/core` as built-public-import proof in Node without framework or browser globals.
- Use `fixtures/react` for built-public-import SSR without DOM globals.

## Assertion value

- Exercise production behavior; derive expected outcomes independently from its contract.
- Reject self-comparisons, assertion-free probes, and expectations copied from the tested algorithm.
- Mock only the unavailable boundary; keep the asserted behavior real.
- A mock supplying its own asserted result proves setup. Next's hand-written Link/router mocks prove adapter wiring only (`packages/next/src/testing/setup.ts`).
- Give each test one scenario and enough assertions to distinguish its failure.
- Prefer exact outcomes over truthiness or existence. Avoid asserting a whole value and every field without a distinct failure to catch.
- Extend tables for equivalent input/output cases; keep distinct lifecycle or event sequences separate.
- Give each table row a meaningful boundary or failure.
- Test through the owning module or consumer so behavior-preserving refactors retain coverage.
- Keep helpers local; add production exports or options only for production needs.
- Check static contracts against the actual artifact structurally when runtime execution is impractical.
- Example: retain real release-workflow prerequisite guards. Synthetic mutations testing a test-local validator add no production proof unless it is production validation code.
- For bug fixes, observe failure on pre-fix behavior for the intended reason, then a pass after repair.
- Exclude unrelated exceptions, missing servers, or mock rejections as regression proof. Report unavailable pre-fix checks.

## Setup and isolation

- Keep arrange, act, and assert visible.
- Share small setup helpers; leave scenarios and expectations at call sites.
- Prefer local setup over mutable suite state or helpers with many switches.
- Reset mocks, DOM, listeners, controllers, and browser resources for independent, order-insensitive tests.
- Use teardown or `finally` to clean up even after assertion failure.

## Waits and browser runners

- Wait for observable readiness or completion with bounded timeouts.
- Use fake timers for timer contracts in specs.
- Before negative assertions, establish completion of the relevant event or operation.
- Explain the limits of necessary observation windows; elapsed sleep alone does not establish completion.
- Give browser scenarios separate identities and fresh contexts where state can leak.
- Share builds and production servers when appropriate.
- Prefer `@playwright/test` fixtures and `webServer` when runner growth obstructs isolation, diagnostic retries, or reliable waits.
- Treat Playwright Test adoption as an explicit tooling change; verify dependency support first.

## Coverage

- Use uncovered branches to find missing contracts; executed lines alone do not prove behavior.
- Run `pnpm coverage` to measure package production files with the configured V8 provider; inspect includes and exclusions before interpreting results.
- Base scoped thresholds on that baseline and risk. Avoid invented percentages or assertions added to satisfy a number.
- Report measurement limits. A missing threshold alone is not a test-quality defect.

## Verify and report

- After edits, run focused owner tests, then required `pnpm validate`.
- Follow root `AGENTS.md` for release and tarball checks when public packages change.
- For read-only advice or review, report the checks supporting each conclusion.
- Report commands, observed results, and untested browser/app contracts.
- Keep mocked or skipped checks distinct from real-browser and production-app proof.
