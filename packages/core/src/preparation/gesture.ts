import {
  findAnchor,
  getLinkIntent,
  isPlainPrimaryEvent,
  type FastLinkIntent,
} from '../interaction';
import { listen } from '../listen';

const CANCELLATION_EVENTS = [
  'pointerdown',
  'pointercancel',
  'dragstart',
  'keydown',
] as const;

/** Prepares work without navigating. A failed preparation leaves click-time fallback available. */
export interface GestureOptions<P> {
  /**
   * Runs in the task after an eligible press, while the gesture is still
   * pending and owned. A click matched before then gets no prepared value.
   */
  prepare(intent: FastLinkIntent): P | null;
}

/** A matched activation, consumed after the adapter's synchronous guards pass. */
export interface PreparedClick<P> {
  /** Rechecks eligibility and consumes once, without preventing the click. */
  consume(): { intent: FastLinkIntent; prepared: P | null } | null;
  /** Discards this activation without affecting a newer gesture. */
  discard(): void;
}

/**
 * One root's pending press, its cancellation tracking, and click matching.
 * The owning controller resolves eligible presses and root ownership; an idle
 * engine holds only its copied options.
 */
export interface ClickGesture<P> {
  /**
   * Replaces options and keeps any pending gesture. An update before the
   * preparation task makes the task call the latest `prepare`.
   */
  update(options: GestureOptions<P>): void;
  /** Starts a gesture for an eligible press already claimed by the owner. */
  prepare(event: PointerEvent, intent: FastLinkIntent): void;
  matchClick(event: MouseEvent): PreparedClick<P> | null;
  discard(): void;
  /** Permanently invalidates pending work and matched candidates. */
  destroy(): void;
}

/**
 * Creates the shared click gesture engine. `isOwner` rechecks the root's live
 * ownership of an anchor, including containment, before a matched click is
 * consumed.
 */
export function createClickGesture<P>(
  root: HTMLElement,
  initialOptions: GestureOptions<P>,
  isOwner: (anchor: HTMLAnchorElement) => boolean,
  isActive: () => boolean,
): ClickGesture<P> {
  let options = { ...initialOptions };
  let pending: Gesture<P> | null = null;
  // Changes on every discard so an older candidate cannot affect a newer gesture.
  let generation = 0;
  let isDestroyed = false;
  let stopObserving: (() => void) | undefined;
  let prepareTimer: ReturnType<typeof setTimeout> | undefined;

  function discard(): void {
    generation++;
    pending = null;
    clearTimeout(prepareTimer);
    stopObserving?.();
    stopObserving = undefined;
  }

  function prepare(event: PointerEvent, intent: FastLinkIntent): void {
    discard();
    if (isDestroyed) return;

    const gesture: Gesture<P> = {
      anchor: intent.anchor,
      href: intent.href,
      url: intent.url.href,
      pointerId: event.pointerId,
      prepared: null,
    };
    pending = gesture;
    stopObserving = observeGestureCancellation(
      root,
      () => pending,
      discard,
      () => clearTimeout(prepareTimer),
    );
    prepareTimer = setTimeout(tryPrepareGesture, 0, gesture, intent);
  }

  function tryPrepareGesture(
    gesture: Gesture<P>,
    intent: FastLinkIntent,
  ): void {
    // A matched, discarded, inactive, or no longer owned gesture prepares nothing.
    if (pending !== gesture || !isActive() || !isOwner(gesture.anchor)) return;
    try {
      const prepared = options.prepare(intent);
      // The callback can synchronously replace or discard this gesture.
      if (pending === gesture) gesture.prepared = prepared;
    } catch {
      // A failed preparation still permits ordinary click-time navigation.
    }
  }

  function matchClick(event: MouseEvent): PreparedClick<P> | null {
    const gesture = pending;
    if (!gesture) return null;
    // An inactive root rejects the click here and again in consume().
    if (!isActive()) {
      discard();
      return null;
    }

    // Take the gesture, but keep cancellation active while adapter guards run.
    pending = null;
    if (!matchesPreparedGesture(event, root, gesture)) {
      discard();
      return null;
    }
    return createPreparedClick(gesture, event);
  }

  function createPreparedClick(
    gesture: Gesture<P>,
    event: MouseEvent,
  ): PreparedClick<P> {
    const matchedGeneration = generation;
    let isConsumed = false;

    function discardCandidate(): void {
      isConsumed = true;
      gesture.prepared = null;
      // An old candidate must leave a newer gesture and its listeners intact.
      if (generation === matchedGeneration) discard();
    }

    // Read ownership and the DOM here, after adapter guards have run.
    function getCurrentIntent(): FastLinkIntent | null {
      if (isDestroyed || !isActive()) return null;
      if (generation !== matchedGeneration) return null;
      if (!isOwner(gesture.anchor)) return null;
      return getLinkIntent(event.target, gesture.anchor);
    }

    return {
      consume() {
        if (isConsumed) return null;
        isConsumed = true;
        try {
          const intent = getCurrentIntent();
          if (!intent) return null;
          return {
            intent,
            prepared: hasSameDestination(gesture, intent)
              ? gesture.prepared
              : null,
          };
        } finally {
          discardCandidate();
        }
      },
      discard: discardCandidate,
    };
  }

  return {
    update(nextOptions) {
      options = { ...nextOptions };
    },
    prepare,
    matchClick,
    discard,
    destroy() {
      isDestroyed = true;
      discard();
    },
  };
}

function matchesPreparedGesture<P>(
  event: MouseEvent,
  root: HTMLElement,
  gesture: Gesture<P>,
): boolean {
  if (!isPlainPrimaryEvent(event) || event.detail === 0) return false;
  if (
    'pointerType' in event &&
    // An empty type means the click reports no pointer, so it is still accepted.
    event.pointerType !== '' &&
    event.pointerType !== 'mouse'
  )
    return false;
  return isOnPreparedAnchor(event, root, gesture);
}

function hasSameDestination<P>(
  gesture: Gesture<P>,
  intent: FastLinkIntent,
): boolean {
  return intent.href === gesture.href && intent.url.href === gesture.url;
}

// The prepared anchor, and the prepared pointer when the event reports one.
function isOnPreparedAnchor<P>(
  event: MouseEvent,
  root: HTMLElement,
  gesture: Gesture<P>,
): boolean {
  if ('pointerId' in event && event.pointerId !== gesture.pointerId)
    return false;
  return findAnchor(event.target, root) === gesture.anchor;
}

// Cancellation listeners exist only while a gesture is pending.
function observeGestureCancellation<P>(
  root: HTMLElement,
  getPending: () => Gesture<P> | null,
  discard: () => void,
  cancelPreparation: () => void,
): () => void {
  const document = root.ownerDocument;
  const view = document.defaultView;
  const eventRoot = root.getRootNode();
  const shadow = eventRoot instanceof ShadowRoot ? eventRoot : null;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;

  function finishRelease(event: PointerEvent): void {
    const gesture = getPending();
    if (!gesture) return;
    // No release needs the task: a release away discards, and a release on the
    // link is followed by its click, which is matched before any task runs.
    cancelPreparation();
    // A release must report the prepared pointer, unlike a click.
    const isPreparedRelease =
      event.pointerId === gesture.pointerId &&
      isOnPreparedAnchor(event, root, gesture);
    if (!isPreparedRelease) {
      discard();
      return;
    }
    // Native click follows release synchronously. A release with no click expires.
    releaseTimer = setTimeout(discard, 0);
  }

  function onPointerUp(event: PointerEvent): void {
    // Outside a closed shadow tree the event target is its host. Recheck inside it.
    if (shadow && event.composedPath().includes(shadow.host)) return;
    finishRelease(event);
  }

  const stopListening = CANCELLATION_EVENTS.map((type) =>
    listen(document, type, discard, true),
  );
  stopListening.push(listen(document, 'pointerup', onPointerUp, true));
  if (shadow)
    stopListening.push(listen(shadow, 'pointerup', finishRelease, true));
  if (view) stopListening.push(listen(view, 'blur', discard));

  return () => {
    clearTimeout(releaseTimer);
    for (const stop of stopListening) stop();
  };
}

type Gesture<P> = {
  anchor: HTMLAnchorElement;
  href: string;
  url: string;
  pointerId: number;
  prepared: P | null;
};
