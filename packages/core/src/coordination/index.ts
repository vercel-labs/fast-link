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
};
Reflect.set(globalThis, COORDINATION, coordination);
