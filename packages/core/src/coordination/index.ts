export type FollowupClick = Pick<
  MouseEvent,
  'target' | 'detail' | 'preventDefault'
>;

interface CoordinationState {
  /** Live controller count, including disabled controllers, for each managed anchor. */
  readonly anchorOwners: WeakMap<HTMLElement, number>;
  /** Sends a containing capture handler's click to the controller that accepted the press. */
  readonly pendingClickOwners: WeakMap<
    HTMLAnchorElement,
    (event: FollowupClick) => void
  >;
  /** Clicks already consumed by a controller during capture. */
  readonly suppressedClicks: WeakSet<FollowupClick>;
  /** Accepted presses, including events that cannot hold the symbol marker. */
  readonly handledEvents: WeakSet<Event>;
  /** Live link-interaction controller count, including native controllers, for each containing root. */
  readonly regionOwners: WeakMap<HTMLElement, number>;
}

// These keys and field meanings are shared between independently bundled versions.
// Reuse the registry and its collections; compatible additions preserve existing fields.
const COORDINATION = Symbol.for('@fast-link/core/coordination');
export const HANDLED_EVENT = Symbol.for('@fast-link/core/handled-event');

export const coordination: CoordinationState = Reflect.get(
  globalThis,
  COORDINATION,
) ?? {
  anchorOwners: new WeakMap<HTMLElement, number>(),
  pendingClickOwners: new WeakMap<
    HTMLAnchorElement,
    (event: FollowupClick) => void
  >(),
  suppressedClicks: new WeakSet<FollowupClick>(),
  handledEvents: new WeakSet<Event>(),
  regionOwners: new WeakMap<HTMLElement, number>(),
};
Reflect.set(globalThis, COORDINATION, coordination);
// A registry created by an earlier version lacks later fields. Add them in place.
if (!Reflect.has(coordination, 'regionOwners')) {
  Reflect.set(coordination, 'regionOwners', new WeakMap<HTMLElement, number>());
}

/** Registers a managed anchor until released; containing roots do not register. */
export function registerAnchorOwner(
  root: HTMLElement,
): (() => void) | undefined {
  if (root.tagName !== 'A') return undefined;
  return retainOwner(coordination.anchorOwners, root);
}

/** Registers a containing link-interaction root, in any mode, until released. */
export function registerRegionOwner(root: HTMLElement): () => void {
  return retainOwner(coordination.regionOwners, root);
}

/** Includes disabled and native controllers, whose anchors keep priority over regions. */
export function hasAnchorOwner(anchor: HTMLAnchorElement): boolean {
  return coordination.anchorOwners.has(anchor);
}

/** Reports whether a registered region lies between `anchor` and `root`, exclusive. */
export function hasCloserRegion(
  root: HTMLElement,
  anchor: HTMLAnchorElement,
): boolean {
  const { regionOwners } = coordination;
  for (
    let element = anchor.parentElement;
    element && element !== root;
    element = element.parentElement
  ) {
    if (regionOwners.has(element)) return true;
  }
  return false;
}

function retainOwner(
  owners: WeakMap<HTMLElement, number>,
  root: HTMLElement,
): () => void {
  owners.set(root, (owners.get(root) ?? 0) + 1);
  return () => {
    const remaining = (owners.get(root) ?? 1) - 1;
    if (remaining) owners.set(root, remaining);
    else owners.delete(root);
  };
}
