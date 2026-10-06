# Changelog

## 0.0.3

Reorganize the package documentation around installation, a working first
controller, the complete public API, and adapter behavior. Runtime behavior is
unchanged.

## 0.0.2

Add the shared navigation decision runner with strict validation, observation,
document navigation, and policy-failure fallback. Give live anchor controllers
priority over containing Regions, including when disabled.

Reject Promise decisions even when their object tag is changed.

Organize core into controller, interaction, and navigation modules with
colocated tests. Keep the package entry point limited to re-exports.

## 0.0.1

### Patch Changes

- Initial release.
