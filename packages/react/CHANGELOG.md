# Changelog

## 0.1.0

- Add `useLinkInteraction` and `LinkInteractionBinding` to bind a core link
  interaction controller in `release`, `immediate`, or `native` mode. Changing
  the mode keeps the element, the controller, and any follow-up click
  suppression. `suppressClick` also prevents the React event.
- Add `useClickPreparation` to bind core click preparation, with its `enabled`
  option. Release preparation runs in the task after press, as in core.
- Both hooks keep pending work across same-element reattachment, leave presses
  native and reject activation while detached, and destroy the controller when
  the element is replaced or unmounts.
- Remove `useFastLink`. Use `useLinkInteraction` with
  `mode: 'immediate'` and a `navigate` callback, attach `ref`, and pass
  `suppressClick` as `onClickCapture`. Call any capture handler of your own
  after it. `enabled: false` becomes `mode: 'native'`.
- Update the core dependency to `^0.1.0`.

## 0.0.2

- Bundle the canonical Fast Link agent skill, references, and agent metadata at
  `skills/fast-link/` in the npm package.
- Update the core dependency to `^0.0.2`.

## 0.0.1

- Initial public release of React bindings for Fast Link controllers, with
  composed refs, committed option updates, and cleanup on root replacement or
  unmount.
