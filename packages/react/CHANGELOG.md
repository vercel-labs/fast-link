# Changelog

## 0.0.3

- Replace `useFastLink` with `useClickPreparation`, the only controller binding.
- Preserve gestures through same-anchor ref reattachment, including Next Link
  href and prefetch updates. Retain cleanup on root replacement and unmount.
- Update the core dependency to `^0.0.3`.

## 0.0.2

- Bundle the canonical Fast Link agent skill, references, and agent metadata at
  `skills/fast-link/` in the npm package.
- Update the core dependency to `^0.0.2`.

## 0.0.1

- Initial public release of React bindings for Fast Link controllers, with
  composed refs, committed option updates, and cleanup on root replacement or
  unmount.
