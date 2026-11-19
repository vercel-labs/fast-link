# Changelog

## 0.1.0

- Add `useLinkInteraction` and `LinkInteractionBinding` to bind a core link
  interaction controller in `release`, `immediate`, or `native` mode. Changing
  the mode keeps the element, the controller, and any follow-up click
  suppression. `suppressClick` also prevents the React event.
- Add `useClickPreparation` to bind core click preparation, with its `enabled`
  option.
- Both hooks keep pending work when a ref reattaches to the same element,
  leave presses native and reject activation while the ref is detached, and
  destroy the controller when
  the element is replaced or unmounts.
- Update the core dependency to `^0.1.0`.

## 0.0.2

- Bundle the canonical Fast Link agent skill, references, and agent metadata at
  `skills/fast-link/` in the npm package.
- Update the core dependency to `^0.0.2`.

## 0.0.1

- Initial public release of React bindings for Fast Link controllers, with
  composed refs, committed option updates, and cleanup on root replacement or
  unmount.
