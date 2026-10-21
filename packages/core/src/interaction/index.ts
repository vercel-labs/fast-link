import { coordination, HANDLED_EVENT } from '../coordination';

const { handledEvents } = coordination;
const NESTED_CONTROL_TAGS = new Set([
  'BUTTON',
  'INPUT',
  'LABEL',
  'SELECT',
  'SUMMARY',
  'TEXTAREA',
]);

/** A validated same-origin destination for a primary mouse pointerdown. */
export interface FastLinkIntent {
  /** The link selected for early navigation. */
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
    event.defaultPrevented ||
    event.button !== 0 ||
    // Touch and pen may start a gesture, so leave them to the browser.
    event.pointerType !== 'mouse' ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    isHandled(event)
  ) {
    return null;
  }

  if (isOptedOut(event.target, anchor)) return null;

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

  markHandled(event);
  return { anchor, href, url };
}

/**
 * Finds the closest anchor between `target` and `boundary`, inclusive.
 *
 * - Returns `null` if a non-null boundary is not reached.
 * - A `null` boundary searches to the top of the target's element tree.
 */
export function findAnchor(
  target: EventTarget | null,
  boundary: EventTarget | null,
): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  if (
    boundary !== null &&
    (!(boundary instanceof Element) || !boundary.contains(target))
  )
    return null;

  let anchor: Element | null =
    target instanceof HTMLAnchorElement ? target : target.closest('a');
  // SVG anchors are not HTML navigation intents; continue to any HTML ancestor.
  while (anchor && !(anchor instanceof HTMLAnchorElement)) {
    anchor = anchor.parentElement?.closest('a') ?? null;
  }
  if (!anchor || boundary === null) return anchor;
  return boundary.contains(anchor) ? anchor : null;
}

function isHandled(event: Event): boolean {
  return handledEvents.has(event) || Reflect.get(event, HANDLED_EVENT) === true;
}

function markHandled(event: Event): void {
  handledEvents.add(event);
  Reflect.set(event, HANDLED_EVENT, true);
}

function isOptedOut(
  eventTarget: EventTarget | null,
  anchor: HTMLAnchorElement,
): boolean {
  if (anchor.hasAttribute('data-no-fast-link')) return true;
  const role = anchor.getAttribute('role');
  if (role && !/^[\t\n\f\r ]*(?:link)?[\t\n\f\r ]*$/i.test(role)) return true;

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
  return /(?:^|[\t\n\f\r ])button(?:$|[\t\n\f\r ])/i.test(
    element.getAttribute('role') ?? '',
  );
}
