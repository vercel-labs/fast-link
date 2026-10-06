import {
  findAnchor,
  resolveFastLink,
  type FastLinkIntent,
} from '../interaction';

// Share anchor ownership across bundles without preventing garbage collection.
const ANCHOR_OWNERS = Symbol.for('@fast-link/core/anchor-owners');
const anchorOwners: WeakMap<HTMLElement, number> =
  Reflect.get(globalThis, ANCHOR_OWNERS) ?? new WeakMap<HTMLElement, number>();
Reflect.set(globalThis, ANCHOR_OWNERS, anchorOwners);

/** Options copied by a Fast Link controller. */
export interface FastLinkOptions {
  /** Enables early navigation unless set to `false`. */
  enabled?: boolean;
  /**
   * Navigates after `onNavigate`; the return value is ignored.
   * Defaults to `location.assign(intent.url.href)` in the anchor's window.
   */
  navigate?: (intent: FastLinkIntent) => void;
  /** Runs immediately before `navigate` for an accepted pointerdown. */
  onNavigate?: (intent: FastLinkIntent) => void;
}

/** Controls listeners and options for one root element. */
export interface FastLinkController {
  /** Replaces all options and preserves any pending follow-up click. */
  update(options: FastLinkOptions): void;
  /** Removes listeners. Repeated calls have no effect. */
  destroy(): void;
}

/**
 * Starts eligible same-origin navigation on primary mouse `pointerdown`.
 *
 * - Attach to an anchor or an element containing anchors.
 * - Options are copied at creation and on each `update()`.
 * - An anchor controller takes priority over containing roots, even when disabled.
 * - Containing roots handle events from the outside in.
 * - Call `destroy()` to remove capture listeners when the root is no longer used.
 */
export function createFastLink(
  root: HTMLElement,
  options: FastLinkOptions = {},
): FastLinkController {
  let currentOptions = { ...options };
  let suppressNextPointerClick = false;
  const ownsAnchor = root.tagName === 'A';
  if (ownsAnchor) anchorOwners.set(root, (anchorOwners.get(root) ?? 0) + 1);

  const onPointerDown = (event: PointerEvent): void => {
    suppressNextPointerClick = false;
    if (currentOptions.enabled === false) return;

    const anchor = findAnchor(event.target, root);
    if (!anchor) return;
    if (anchor !== root && anchorOwners.has(anchor)) return;

    const intent = resolveFastLink(event, anchor);
    if (!intent) return;

    suppressNextPointerClick = true;
    currentOptions.onNavigate?.(intent);
    (currentOptions.navigate ?? navigateInBrowser)(intent);
  };

  const onClick = (event: MouseEvent): void => {
    if (!suppressNextPointerClick) return;
    // Leave keyboard and synthetic clicks to the browser.
    if (event.detail === 0) return;
    suppressNextPointerClick = false;
    event.preventDefault();
  };

  root.addEventListener('pointerdown', onPointerDown, { capture: true });
  root.addEventListener('click', onClick, { capture: true });

  let destroyed = false;
  return {
    update(nextOptions): void {
      currentOptions = { ...nextOptions };
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (ownsAnchor) {
        const remaining = (anchorOwners.get(root) ?? 1) - 1;
        if (remaining) anchorOwners.set(root, remaining);
        else anchorOwners.delete(root);
      }
      root.removeEventListener('pointerdown', onPointerDown, { capture: true });
      root.removeEventListener('click', onClick, { capture: true });
    },
  };
}

function navigateInBrowser({ anchor, url }: FastLinkIntent): void {
  anchor.ownerDocument.defaultView?.location.assign(url.href);
}
