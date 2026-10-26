# Changelog

## 0.0.9

- Document iframe setup and which anchor roles allow early navigation.

## 0.0.8

- Document that sites requiring WCAG Level A or AA conformance should leave Fast Link disabled.

## 0.0.7

- Accelerate anchors only when their role is absent, empty, or `link`.
- Leave presses inside descendants with any `button` role token native.

## 0.0.6

- Explain press and click state with an inline diagram and matching rules.

## 0.0.5

- Share controller and event coordination through one internal registry.

## 0.0.4

- State supported Node.js versions in the README.
- Document alpha accessibility limits and how to retain ordinary click behavior.

## 0.0.3

- Require Node.js 22 or later and remove the package-manager requirement.

## 0.0.2

- Rename the observer to `onFastNavigate` and attempt navigation when it throws.
- Keep anchor lookup and event resolution internal.

## 0.0.1

- Document press-time safety, controller updates and cleanup, and callback ordering.
- Ignore extra navigation decision properties while validating supported fields.
- Surface the navigation error when a policy or observer also fails.
- Initial release.
