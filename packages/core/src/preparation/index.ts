import { hasAnchorOwner, registerAnchorOwner } from '../coordination';
import {
  findAnchor,
  getLinkIntent,
  isHandled,
  markHandled,
  resolveFastLink,
  type FastLinkIntent,
} from '../interaction';

const CANCELLATION_EVENTS = [
  'pointerdown',
  'pointercancel',
  'dragstart',
  'keydown',
] as const;

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
  const state = createPreparationState(root, options);
  const releaseAnchor = registerAnchorOwner(root);
  const onPointerDown = (event: PointerEvent) => prepareFromPress(state, event);

  root.addEventListener('pointerdown', onPointerDown, true);

  return {
    matchClick: (event) => matchPreparedClick(state, event),
    discard: () => discardGesture(state),
    update(nextOptions) {
      state.options = { ...nextOptions };
      if (state.options.enabled === false) discardGesture(state);
    },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      discardGesture(state);
      root.removeEventListener('pointerdown', onPointerDown, true);
      releaseAnchor?.();
    },
  };
}

function prepareFromPress<P>(
  state: PreparationState<P>,
  event: PointerEvent,
): void {
  discardGesture(state);
  if (state.destroyed || state.options.enabled === false) return;

  const anchor = findAnchor(event.target, state.root);
  if (!anchor || !hasAnchorPriority(state.root, anchor)) return;
  const intent = resolveFastLink(event, anchor);
  if (!intent) return;

  const gesture: Gesture<P> = {
    anchor,
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
  state: PreparationState<P>,
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
  state: PreparationState<P>,
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

// Read options, ownership, and the DOM here, after adapter guards have run.
function getCurrentIntent<P>(
  state: PreparationState<P>,
  gesture: Gesture<P>,
  event: MouseEvent,
  matchedGeneration: number,
): FastLinkIntent | null {
  if (state.destroyed || state.options.enabled === false) return null;
  if (state.generation !== matchedGeneration || isHandled(event)) return null;
  if (!state.root.contains(gesture.anchor)) return null;
  if (!hasAnchorPriority(state.root, gesture.anchor)) return null;
  return getLinkIntent(event.target, gesture.anchor);
}

function tryPrepareGesture<P>(
  state: PreparationState<P>,
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

function discardGesture<P>(state: PreparationState<P>): void {
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

function hasAnchorPriority(
  root: HTMLElement,
  anchor: HTMLAnchorElement,
): boolean {
  return anchor === root || !hasAnchorOwner(anchor);
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

function observeGestureCancellation<P>(state: PreparationState<P>): () => void {
  const { root, document, shadow, view } = state;
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

function createPreparationState<P>(
  root: HTMLElement,
  options: ClickPreparationOptions<P>,
): PreparationState<P> {
  const document = root.ownerDocument;
  const eventRoot = root.getRootNode();
  return {
    root,
    document,
    shadow: eventRoot instanceof ShadowRoot ? eventRoot : null,
    view: document.defaultView,
    options: { ...options },
    pending: null,
    generation: 0,
    destroyed: false,
    stopObserving: undefined,
  };
}

type PreparationState<P> = {
  readonly root: HTMLElement;
  readonly document: Document;
  readonly shadow: ShadowRoot | null;
  readonly view: Window | null;
  options: ClickPreparationOptions<P>;
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
