import { hasAnchorOwner, registerAnchorOwner } from '../coordination';
import {
  findAnchor,
  getLinkIntent,
  isHandled,
  markHandled,
  resolveFastLink,
  type FastLinkIntent,
} from '../interaction';

/** Prepares work without navigating. A failed preparation leaves click-time fallback available. */
export interface ClickPreparationOptions<P> {
  enabled?: boolean;
  prepare(intent: FastLinkIntent): P | null;
}

/** A matched activation, consumed after the adapter's synchronous guards pass. */
export interface PreparedClick<P> {
  /** Rechecks eligibility and consumes once, without preventing the click. */
  consume(): { intent: FastLinkIntent; prepared: P | null } | null;
  /** Discards this activation without affecting a newer gesture. */
  discard(): void;
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
  let current = { ...options };
  let pending: Gesture<P> | null = null;
  let generation = 0;
  let destroyed = false;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  const document = root.ownerDocument;
  const eventRoot = root.getRootNode();
  const shadow = eventRoot instanceof ShadowRoot ? eventRoot : null;
  const view = document.defaultView;
  const releaseAnchor = registerAnchorOwner(root);

  function removeGestureListeners(): void {
    clearTimeout(releaseTimer);
    releaseTimer = undefined;
    document.removeEventListener('pointerdown', discard, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    shadow?.removeEventListener('pointerup', onShadowPointerUp, true);
    document.removeEventListener('pointercancel', discard, true);
    document.removeEventListener('dragstart', discard, true);
    document.removeEventListener('keydown', discard, true);
    view?.removeEventListener('blur', discard);
  }

  function discard(): void {
    generation++;
    pending = null;
    removeGestureListeners();
  }

  function onPointerUp(event: PointerEvent): void {
    // Outside a closed shadow tree the event target is its host. Recheck inside it.
    if (shadow && event.composedPath().includes(shadow.host)) return;
    finishRelease(event);
  }

  function onShadowPointerUp(event: Event): void {
    finishRelease(event as PointerEvent);
  }

  function finishRelease(event: PointerEvent): void {
    if (!pending) return;
    const releasedOnAnchor =
      event.pointerId === pending.pointerId &&
      findAnchor(event.target, root) === pending.anchor;
    if (!releasedOnAnchor) {
      discard();
      return;
    }
    // Native click follows release synchronously. A release with no click expires.
    releaseTimer = setTimeout(discard, 0);
  }

  function onPointerDown(event: PointerEvent): void {
    discard();
    if (destroyed || current.enabled === false) return;
    const anchor = findAnchor(event.target, root);
    if (!anchor || (anchor !== root && hasAnchorOwner(anchor))) return;
    const intent = resolveFastLink(event, anchor);
    if (!intent) return;

    const gesture: Gesture<P> = {
      anchor,
      href: intent.href,
      url: intent.url.href,
      pointerId: event.pointerId,
      prepared: null,
    };
    pending = gesture;
    document.addEventListener('pointerdown', discard, true);
    document.addEventListener('pointerup', onPointerUp, true);
    shadow?.addEventListener('pointerup', onShadowPointerUp, true);
    document.addEventListener('pointercancel', discard, true);
    document.addEventListener('dragstart', discard, true);
    document.addEventListener('keydown', discard, true);
    view?.addEventListener('blur', discard);
    try {
      const prepared = current.prepare(intent);
      // Preparation can synchronously replace the root or start another gesture.
      if (pending === gesture) gesture.prepared = prepared;
    } catch {
      // Preparation is speculative; errors cannot navigate or prevent activation.
    }
  }

  function matchClick(event: MouseEvent): PreparedClick<P> | null {
    const gesture = pending;
    if (!gesture) return null;
    pending = null;
    if (
      event.defaultPrevented ||
      event.detail === 0 ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      ('pointerType' in event &&
        event.pointerType !== '' &&
        event.pointerType !== 'mouse') ||
      ('pointerId' in event && event.pointerId !== gesture.pointerId) ||
      findAnchor(event.target, root) !== gesture.anchor
    ) {
      discard();
      return null;
    }

    const matchedGeneration = generation;
    let consumed = false;
    const discardCandidate = (): void => {
      consumed = true;
      gesture.prepared = null;
      // Old candidates must not remove a newer gesture's cancellation listeners.
      if (generation === matchedGeneration) discard();
    };
    return {
      consume() {
        if (consumed) return null;
        consumed = true;
        try {
          if (
            destroyed ||
            current.enabled === false ||
            generation !== matchedGeneration ||
            isHandled(event)
          )
            return null;
          if (!root.contains(gesture.anchor)) return null;
          if (gesture.anchor !== root && hasAnchorOwner(gesture.anchor))
            return null;
          const intent = getLinkIntent(event.target, gesture.anchor);
          if (!intent) return null;
          markHandled(event);
          const destinationUnchanged =
            intent.href === gesture.href && intent.url.href === gesture.url;
          return {
            intent,
            prepared: destinationUnchanged ? gesture.prepared : null,
          };
        } finally {
          discardCandidate();
        }
      },
      discard: discardCandidate,
    };
  }

  root.addEventListener('pointerdown', onPointerDown, true);
  return {
    matchClick,
    discard,
    update(nextOptions) {
      current = { ...nextOptions };
      if (current.enabled === false) discard();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      discard();
      root.removeEventListener('pointerdown', onPointerDown, true);
      releaseAnchor?.();
    },
  };
}

type Gesture<P> = {
  anchor: HTMLAnchorElement;
  href: string;
  url: string;
  pointerId: number;
  prepared: P | null;
};
