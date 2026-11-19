import { hasAnchorOwner, registerAnchorOwner } from '../coordination';
import { findAnchor, resolveFastLink } from '../interaction';
import { listen } from '../listen';
import {
  createClickGesture,
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
  /** Drops pending preparation and matched candidates only. */
  discard(): void;
  /** Destroys pending work, listeners, and managed-anchor registration. Repeated calls do nothing. */
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
  let isEnabled = options.enabled !== false;
  let isDestroyed = false;
  const gesture = createClickGesture(root, options, (anchor) =>
    hasAnchorPriority(root, anchor),
  );
  const releaseAnchor = registerAnchorOwner(root);
  const stopListening = listen(root, 'pointerdown', prepareFromPress, true);

  function prepareFromPress(event: PointerEvent): void {
    gesture.discard();
    if (isDestroyed || !isEnabled) return;

    const anchor = findAnchor(event.target, root);
    if (!anchor || !hasAnchorPriority(root, anchor)) return;
    const intent = resolveFastLink(event, anchor);
    if (!intent) return;
    gesture.prepare(event, intent);
  }

  return {
    matchClick: (event) => gesture.matchClick(event),
    discard: () => gesture.discard(),
    update(nextOptions) {
      isEnabled = nextOptions.enabled !== false;
      gesture.update(nextOptions);
      if (!isEnabled) gesture.discard();
    },
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      gesture.destroy();
      stopListening();
      releaseAnchor?.();
    },
  };
}

// Containing preparation roots keep outside-in order; only managed anchors take priority.
function hasAnchorPriority(
  root: HTMLElement,
  anchor: HTMLAnchorElement,
): boolean {
  return anchor === root || (root.contains(anchor) && !hasAnchorOwner(anchor));
}
