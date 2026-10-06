# Architecture decisions

These decisions explain Fast Link's current architecture and its trade-offs.
Package READMEs document the complete caller contracts.

| Decision                                                                                       | Why it matters                                                                               |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [0001: Separate DOM, React, and Next](./0001-separate-dom-react-and-next.md)                   | Share interaction behavior and lifecycle while keeping framework routing in adapters.        |
| [0002: Start navigation on mouse pointerdown](./0002-start-navigation-on-mouse-pointerdown.md) | Start before release while leaving touch, pen, and keyboard activation native.               |
| [0003: Let applications choose navigation](./0003-let-applications-choose-navigation.md)       | Same-origin eligibility does not establish client router ownership.                          |
| [0004: Use public Next routing interfaces](./0004-use-public-next-routing-interfaces.md)       | Preserve Link behavior without depending on private Next modules.                            |
| [0005: Coordinate nested roots](./0005-coordinate-nested-roots.md)                             | Keep per-link behavior inside regions and deduplicate accepted events across package copies. |

For usage and options, see [core](../../packages/core/README.md),
[React](../../packages/react/README.md), and [Next.js](../../packages/next/README.md).
