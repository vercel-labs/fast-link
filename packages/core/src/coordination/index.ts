interface CoordinationState {
  /** Live controller count, including disabled controllers, for each managed anchor. */
  readonly anchorOwners: WeakMap<HTMLElement, number>;
  /** Accepted presses and prepared clicks, including events that cannot hold the marker. */
  readonly handledEvents: WeakSet<Event>;
}

// Share ownership and event claims between independently bundled copies.
const COORDINATION = Symbol.for('@fast-link/core/coordination');
export const HANDLED_EVENT = Symbol.for('@fast-link/core/handled-event');

export const coordination: CoordinationState = Reflect.get(
  globalThis,
  COORDINATION,
) ?? {
  anchorOwners: new WeakMap<HTMLElement, number>(),
  handledEvents: new WeakSet<Event>(),
};
Reflect.set(globalThis, COORDINATION, coordination);

/** Registers a managed anchor until its controller is destroyed; containing roots do not register. */
export function registerAnchorOwner(
  root: HTMLElement,
): (() => void) | undefined {
  if (root.tagName !== 'A') return undefined;
  const { anchorOwners } = coordination;
  anchorOwners.set(root, (anchorOwners.get(root) ?? 0) + 1);
  return () => {
    const remaining = (anchorOwners.get(root) ?? 1) - 1;
    if (remaining) anchorOwners.set(root, remaining);
    else anchorOwners.delete(root);
  };
}

/** Includes disabled controllers, whose anchors still take priority over regions. */
export function hasAnchorOwner(anchor: HTMLAnchorElement): boolean {
  return coordination.anchorOwners.has(anchor);
}
