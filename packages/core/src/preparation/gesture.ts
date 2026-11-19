import {
  findAnchor,
  getLinkIntent,
  isHandled,
  markHandled,
  type FastLinkIntent,
} from '../interaction';

const CANCELLATION_EVENTS = [
  'pointerdown',
  'pointercancel',
  'dragstart',
  'keydown',
] as const;

/** Prepares work without navigating. A failed preparation leaves click-time fallback available. */
export interface GestureOptions<P> {
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
  /** Replaces options and keeps any pending gesture. */
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
 * ownership of an anchor before a matched click is consumed.
 */
export function createClickGesture<P>(
  root: HTMLElement,
  options: GestureOptions<P>,
  isOwner: (anchor: HTMLAnchorElement) => boolean,
): ClickGesture<P> {
  const state: GestureState<P> = {
    root,
    isOwner,
    options: { ...options },
    pending: null,
    generation: 0,
    destroyed: false,
    stopObserving: undefined,
  };

  return {
    update(nextOptions) {
      state.options = { ...nextOptions };
    },
    prepare: (event, intent) => startGesture(state, event, intent),
    matchClick: (event) => matchPreparedClick(state, event),
    discard: () => discardGesture(state),
    destroy() {
      state.destroyed = true;
      discardGesture(state);
    },
  };
}

function startGesture<P>(
  state: GestureState<P>,
  event: PointerEvent,
  intent: FastLinkIntent,
): void {
  discardGesture(state);
  if (state.destroyed) return;

  const gesture: Gesture<P> = {
    anchor: intent.anchor,
    href: intent.href,
    url: intent.url.href,
    pointerId: event.pointerId,
    prepared: null,
  };
  state.pending = gesture;
  state.stopObserving = observeGestureCancellation(state);
  tryPrepareGesture(state, gesture, intent);
}

function matchPreparedClick<P>(
  state: GestureState<P>,
  event: MouseEvent,
): PreparedClick<P> | null {
  const gesture = state.pending;
  if (!gesture) return null;

  // Take the gesture, but keep cancellation active while adapter guards run.
  state.pending = null;
  if (!matchesPreparedGesture(event, state.root, gesture)) {
    discardGesture(state);
    return null;
  }
  return createPreparedClick(state, gesture, event);
}

function createPreparedClick<P>(
  state: GestureState<P>,
  gesture: Gesture<P>,
  event: MouseEvent,
): PreparedClick<P> {
  const matchedGeneration = state.generation;
  let consumed = false;

  function discard(): void {
    consumed = true;
    gesture.prepared = null;
    // An old candidate must leave a newer gesture and its listeners intact.
    if (state.generation === matchedGeneration) discardGesture(state);
  }

  return {
    consume() {
      if (consumed) return null;
      consumed = true;
      try {
        const intent = getCurrentIntent(
          state,
          gesture,
          event,
          matchedGeneration,
        );
        if (!intent) return null;

        markHandled(event);
        return {
          intent,
          prepared: hasSameDestination(gesture, intent)
            ? gesture.prepared
            : null,
        };
      } finally {
        discard();
      }
    },
    discard,
  };
}

// Read ownership and the DOM here, after adapter guards have run.
function getCurrentIntent<P>(
  state: GestureState<P>,
  gesture: Gesture<P>,
  event: MouseEvent,
  matchedGeneration: number,
): FastLinkIntent | null {
  if (state.destroyed) return null;
  if (state.generation !== matchedGeneration || isHandled(event)) return null;
  if (!state.root.contains(gesture.anchor)) return null;
  if (!state.isOwner(gesture.anchor)) return null;
  return getLinkIntent(event.target, gesture.anchor);
}

function tryPrepareGesture<P>(
  state: GestureState<P>,
  gesture: Gesture<P>,
  intent: FastLinkIntent,
): void {
  try {
    const prepared = state.options.prepare(intent);
    // The callback can synchronously replace or discard this gesture.
    if (state.pending === gesture) gesture.prepared = prepared;
  } catch {
    // A failed preparation still permits ordinary click-time navigation.
  }
}

function discardGesture<P>(state: GestureState<P>): void {
  state.generation++;
  state.pending = null;
  state.stopObserving?.();
  state.stopObserving = undefined;
}

function matchesPreparedGesture<P>(
  event: MouseEvent,
  root: HTMLElement,
  gesture: Gesture<P>,
): boolean {
  if (event.defaultPrevented || event.detail === 0 || event.button !== 0)
    return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
    return false;
  if (
    'pointerType' in event &&
    event.pointerType !== '' &&
    event.pointerType !== 'mouse'
  )
    return false;
  if ('pointerId' in event && event.pointerId !== gesture.pointerId)
    return false;
  return findAnchor(event.target, root) === gesture.anchor;
}

function hasSameDestination<P>(
  gesture: Gesture<P>,
  intent: FastLinkIntent,
): boolean {
  return intent.href === gesture.href && intent.url.href === gesture.url;
}

function isReleaseOnPreparedAnchor<P>(
  event: PointerEvent,
  root: HTMLElement,
  gesture: Gesture<P>,
): boolean {
  return (
    event.pointerId === gesture.pointerId &&
    findAnchor(event.target, root) === gesture.anchor
  );
}

// Cancellation listeners exist only while a gesture is pending.
function observeGestureCancellation<P>(state: GestureState<P>): () => void {
  const { root } = state;
  const document = root.ownerDocument;
  const view = document.defaultView;
  const eventRoot = root.getRootNode();
  const shadow = eventRoot instanceof ShadowRoot ? eventRoot : null;
  let releaseTimer: ReturnType<typeof setTimeout> | undefined;
  const discard = () => discardGesture(state);

  function finishRelease(event: PointerEvent): void {
    const gesture = state.pending;
    if (!gesture) return;
    if (!isReleaseOnPreparedAnchor(event, root, gesture)) {
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

  function onShadowPointerUp(event: Event): void {
    finishRelease(event as PointerEvent);
  }

  for (const event of CANCELLATION_EVENTS) {
    document.addEventListener(event, discard, true);
  }
  document.addEventListener('pointerup', onPointerUp, true);
  shadow?.addEventListener('pointerup', onShadowPointerUp, true);
  view?.addEventListener('blur', discard);

  return () => {
    clearTimeout(releaseTimer);
    for (const event of CANCELLATION_EVENTS) {
      document.removeEventListener(event, discard, true);
    }
    document.removeEventListener('pointerup', onPointerUp, true);
    shadow?.removeEventListener('pointerup', onShadowPointerUp, true);
    view?.removeEventListener('blur', discard);
  };
}

type GestureState<P> = {
  readonly root: HTMLElement;
  readonly isOwner: (anchor: HTMLAnchorElement) => boolean;
  options: GestureOptions<P>;
  pending: Gesture<P> | null;
  generation: number;
  destroyed: boolean;
  stopObserving: (() => void) | undefined;
};

type Gesture<P> = {
  anchor: HTMLAnchorElement;
  href: string;
  url: string;
  pointerId: number;
  prepared: P | null;
};
