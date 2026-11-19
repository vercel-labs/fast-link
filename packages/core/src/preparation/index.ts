import { hasAnchorOwner, registerAnchorOwner } from '../coordination';
import { findAnchor, resolveFastLink } from '../interaction';
import {
  createClickGesture,
  type ClickGesture,
  type GestureOptions,
  type PreparedClick,
} from './gesture';

export type { PreparedClick } from './gesture';

/** Prepares work without navigating. A failed preparation leaves click-time fallback available. */
export interface ClickPreparationOptions<P> extends GestureOptions<P> {
  enabled?: boolean;
}

/** Owns one root's eligible mouse gesture; adapters own click acceptance and navigation. */
export interface ClickPreparationController<P> {
  /** Replaces options. Disabling discards the gesture; other updates preserve it. */
  update(options: ClickPreparationOptions<P>): void;
  /** Matches before synchronous guards. Consume or discard every returned candidate. */
  matchClick(event: MouseEvent): PreparedClick<P> | null;
  discard(): void;
  destroy(): void;
}

/**
 * Prepares eligible mouse presses, then matches their clicks without navigating.
 * Managed anchors retain priority even when disabled. New input, drag, cancellation,
 * release away, and destruction discard preparation. Destroy when the root detaches.
 * Discarding opaque preparation does not cancel provider work.
 */
export function createClickPreparation<P>(
  root: HTMLElement,
  options: ClickPreparationOptions<P>,
): ClickPreparationController<P> {
  const state: PreparationState<P> = {
    root,
    options: { ...options },
    gesture: createClickGesture(root, options, (anchor) =>
      hasAnchorPriority(root, anchor),
    ),
    destroyed: false,
  };
  const releaseAnchor = registerAnchorOwner(root);
  const onPointerDown = (event: PointerEvent) => prepareFromPress(state, event);

  root.addEventListener('pointerdown', onPointerDown, true);

  return {
    matchClick: (event) => state.gesture.matchClick(event),
    discard: () => state.gesture.discard(),
    update(nextOptions) {
      state.options = { ...nextOptions };
      state.gesture.update(state.options);
      if (state.options.enabled === false) state.gesture.discard();
    },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      state.gesture.destroy();
      root.removeEventListener('pointerdown', onPointerDown, true);
      releaseAnchor?.();
    },
  };
}

function prepareFromPress<P>(
  state: PreparationState<P>,
  event: PointerEvent,
): void {
  state.gesture.discard();
  if (state.destroyed || state.options.enabled === false) return;

  const anchor = findAnchor(event.target, state.root);
  if (!anchor || !hasAnchorPriority(state.root, anchor)) return;
  const intent = resolveFastLink(event, anchor);
  if (!intent) return;
  state.gesture.prepare(event, intent);
}

// Containing preparation roots keep outside-in order; only managed anchors take
// priority. A root never owns a link it no longer contains.
function hasAnchorPriority(
  root: HTMLElement,
  anchor: HTMLAnchorElement,
): boolean {
  return anchor === root || (root.contains(anchor) && !hasAnchorOwner(anchor));
}

type PreparationState<P> = {
  readonly root: HTMLElement;
  options: ClickPreparationOptions<P>;
  readonly gesture: ClickGesture<P>;
  destroyed: boolean;
};
