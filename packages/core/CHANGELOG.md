# Changelog

## 0.0.3

- Replace `createFastLink` with `createClickPreparation`. Prepare on press;
  adapters accept matching clicks and own default prevention and navigation.
- Remove press navigation and follow-up suppression APIs and state.
- Preserve gesture cancellation, live anchor ownership, and cross-copy event claims.
- Export decision validation for speculative policy classification.

## 0.0.2

- Bundle the canonical Fast Link agent skill, references, and agent metadata at
  `skills/fast-link/` in the npm package.

## 0.0.1

- Initial public release of the framework-independent controller for early
  same-origin mouse navigation, with shared eligibility checks, follow-up click
  suppression, and explicit cleanup.
