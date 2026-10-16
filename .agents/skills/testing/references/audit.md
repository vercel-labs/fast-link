# Audit and cleanup

- Keep review-only requests read-only.
- Optimize for confidence and maintenance cost, not deleted lines or test counts.

## Discovery

- Name the package, feature, or files in scope.
- Inspect production owners, overlapping specs, browser tests, app fixtures, and CI routing.
- Run relevant tests for a baseline when execution is in scope; distinguish failures, skips, and unrouted tests.
- Map contracts to primary tests and each additional layer's distinct risk.
- Look for missing behavior as well as unnecessary assertions.
- Read relevant history when a test's purpose is unclear.

## Candidates

- Classify each candidate: keep, merge, rewrite, move, delete, or investigate.
- Apply the main skill's assertion and maintenance rules.
- Investigate self-comparisons, implementation-derived expectations, mocks supplying asserted behavior, source-text matching, duplicate matrices, and test-local validators.
- Check hard sleeps, shared mutable state, and long serial browser scenarios.
- Treat these patterns as leads, not automatic deletion rules.

Record before cleanup:

- Exact test name and `file:line`.
- Failure it actually detects.
- Why its proof is weak or costly.
- Proposed action and remaining or replacement proof.
- Source establishing obsolescence, when claimed.

## Cleanup

- Edit only when cleanup is requested; choose one coherent batch.
- Preserve unique regressions and independent release, packaging, architecture, and browser contracts.
- Make slow unique tests cheaper or move them to a suitable layer.
- Inspect non-test consumers before removing helpers or production seams.
- Retain uncertain candidates until their purpose is resolved.
- Treat retained baseline failures as possible product bugs, not deletion targets.

## Verification

- Run affected owner and overlapping tests, then required repository validation.
- For rewritten regressions, demonstrate that the intended broken behavior still fails.
- Check the diff for lost cases and unrelated production changes.

## Report

| Test and location | Detected failure / issue | Action | Remaining or replacement proof |
| ----------------- | ------------------------ | ------ | ------------------------------ |

Finish with:

- Changes made and valuable tests retained.
- Commands and observed results.
- Untested contracts and unresolved candidates.
- Relevant coverage configuration, measurement limits, and follow-up measurement.
