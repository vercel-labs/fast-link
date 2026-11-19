import { coordination, HANDLED_EVENT } from '../coordination';

const { handledEvents } = coordination;
const EMPTY_OR_LINK_ROLE = /^[\t\n\f\r ]*(?:link)?[\t\n\f\r ]*$/i;
const BUTTON_ROLE_TOKEN = /(?:^|[\t\n\f\r ])button(?:$|[\t\n\f\r ])/i;
const NESTED_CONTROL_TAGS = new Set([
  'BUTTON',
  'INPUT',
  'LABEL',
  'SELECT',
  'SUMMARY',
  'TEXTAREA',
]);

/** A validated same-origin destination for an eligible link interaction. */
export interface FastLinkIntent {
  /** The source link for the interaction. */
  readonly anchor: HTMLAnchorElement;
  /** The authored `href` attribute, before URL resolution. */
  readonly href: string;
  /** The fully resolved same-origin destination. */
  readonly url: URL;
}

/**
 * Returns a navigation intent for an eligible mouse pointerdown.
 *
 * - Pass the anchor containing the event target, usually from `findAnchor()`.
 * - Returns `null` for touch, pen, or interactions that must stay native.
 * - Marks accepted events as handled to prevent navigation by another root.
 */
export function resolveFastLink(
  event: PointerEvent,
  anchor: HTMLAnchorElement,
): FastLinkIntent | null {
  if (
    !isPlainPrimaryEvent(event) ||
    // Touch and pen may start a gesture, so leave them to the browser.
    event.pointerType !== 'mouse' ||
    isHandled(event)
  ) {
    return null;
  }

  const intent = getLinkIntent(event.target, anchor);
  if (intent) markHandled(event);
  return intent;
}

/** Rechecks the live destination and native opt-outs without claiming an event. */
export function getLinkIntent(
  targetElement: EventTarget | null,
  anchor: HTMLAnchorElement,
): FastLinkIntent | null {
  if (isOptedOut(targetElement, anchor)) return null;

  const target = anchor.getAttribute('target');
  if (target && target !== '_self') return null;
  if (anchor.hasAttribute('download')) return null;

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#')) return null;

  const view = anchor.ownerDocument.defaultView;
  if (!view) return null;

  let url: URL;
  try {
    url = new URL(href, anchor.ownerDocument.baseURI);
    if (url.origin !== view.location.origin) return null;
  } catch {
    return null;
  }

  return { anchor, href, url };
}

/**
 * Primary button, not prevented, and no modifier that requests another
 * browser action. Pointer type and click detail are checked by each caller.
 */
export function isPlainPrimaryEvent(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/**
 * Finds the closest anchor between `target` and `root`, inclusive. Returns
 * `null` if the target is outside `root` or no anchor is reached within it.
 */
export function findAnchor(
  target: EventTarget | null,
  root: Element,
): HTMLAnchorElement | null {
  if (!(target instanceof Element) || !root.contains(target)) return null;

  let anchor: Element | null =
    target instanceof HTMLAnchorElement ? target : target.closest('a');
  // SVG anchors are not HTML navigation intents; continue to any HTML ancestor.
  while (anchor && !(anchor instanceof HTMLAnchorElement)) {
    anchor = anchor.parentElement?.closest('a') ?? null;
  }
  return anchor && root.contains(anchor) ? anchor : null;
}

export function isHandled(event: Event): boolean {
  return handledEvents.has(event) || Reflect.get(event, HANDLED_EVENT) === true;
}

export function markHandled(event: Event): void {
  handledEvents.add(event);
  Reflect.set(event, HANDLED_EVENT, true);
}

function isOptedOut(
  eventTarget: EventTarget | null,
  anchor: HTMLAnchorElement,
): boolean {
  if (anchor.hasAttribute('data-no-fast-link')) return true;
  const role = anchor.getAttribute('role');
  if (role && !EMPTY_OR_LINK_ROLE.test(role)) return true;

  let element = eventTarget instanceof Element ? eventTarget : null;
  while (element && element !== anchor) {
    if (element.hasAttribute('data-no-fast-link')) return true;
    if (NESTED_CONTROL_TAGS.has(element.tagName)) return true;
    if (hasButtonRoleToken(element)) return true;
    element = element.parentElement;
  }

  return false;
}

function hasButtonRoleToken(element: Element): boolean {
  return BUTTON_ROLE_TOKEN.test(element.getAttribute('role') ?? '');
}
