# Architecture decisions

These decisions explain Fast Link's current architecture and its trade-offs.
Package READMEs document the complete caller contracts.

| Decision                                                                                                 | Why it matters                                                                                            |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [0001: Separate DOM, React, and Next](./0001-separate-dom-react-and-next.md)                             | Share interaction behavior and lifecycle while keeping framework routing in adapters.                     |
| [0002: Start navigation on mouse pointerdown](./0002-start-navigation-on-mouse-pointerdown.md)           | Start before release while leaving touch, pen, and keyboard activation native. Immediate mode since 0007. |
| [0003: Let applications choose navigation](./0003-let-applications-choose-navigation.md)                 | Same-origin eligibility does not establish client router ownership.                                       |
| [0004: Use public Next routing interfaces](./0004-use-public-next-routing-interfaces.md)                 | Preserve Link behavior without depending on private Next modules.                                         |
| [0005: Coordinate nested roots](./0005-coordinate-nested-roots.md)                                       | Keep per-link behavior inside regions and deduplicate accepted events across package copies.              |
| [0006: Prepare on press, navigate on accepted click](./0006-prepare-on-press-navigate-on-click.md)       | Keep release-time cancellation while starting router work on press. Release mode since 0007.              |
| [0007: Make early navigation an explicit mode](./0007-configurable-navigation-modes.md)                  | Choose release, immediate, or native per root without remounting.                                         |
| [0008: Let the closest region configure ordinary links](./0008-use-closest-region-for-ordinary-links.md) | A native inner region blocks outer acceleration; managed links keep their own mode.                       |
| [0009: Enforce root activity in core](./0009-enforce-root-activity-in-core.md)                           | Adapters report attachment; core checks it before claiming, preparing, or arming suppression.             |

For usage and options, see [core](../../packages/core/README.md),
[React](../../packages/react/README.md), and [Next.js](../../packages/next/README.md).
