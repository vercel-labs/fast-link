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

type FollowupClick = Pick<MouseEvent, 'target' | 'detail' | 'preventDefault'>;

// A consumed framework event needs no more owner lookups along capture.
const SUPPRESSED_CLICKS = Symbol.for('@fast-link/core/suppressed-clicks');
const suppressedClicks: WeakSet<FollowupClick> =
  Reflect.get(globalThis, SUPPRESSED_CLICKS) ?? new WeakSet();
Reflect.set(globalThis, SUPPRESSED_CLICKS, suppressedClicks);

// Route containing capture handlers to the pending click's owner across bundles.
const PENDING_CLICK_OWNERS = Symbol.for('@fast-link/core/pending-click-owners');
const pendingClickOwners: WeakMap<
  HTMLAnchorElement,
  (event: FollowupClick) => void
> = Reflect.get(globalThis, PENDING_CLICK_OWNERS) ?? new WeakMap();
Reflect.set(globalThis, PENDING_CLICK_OWNERS, pendingClickOwners);

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
  /**
   * Applies pending click suppression from an earlier framework capture handler.
   * Pass its event directly so preventDefault updates the framework event too.
   * Matches the accepted anchor and its descendants inside the controller root.
   * Containing controllers can forward to a managed anchor's pending owner.
   * Detail-zero and out-of-root clicks stay native; propagation is preserved.
   */
  suppressClick(event: FollowupClick): void;
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
  let pendingAnchor: HTMLAnchorElement | null = null;
  let destroyed = false;
  const ownsAnchor = root.tagName === 'A';
  if (ownsAnchor) anchorOwners.set(root, (anchorOwners.get(root) ?? 0) + 1);

  const clearPendingClick = (): void => {
    if (
      pendingAnchor &&
      pendingClickOwners.get(pendingAnchor) === consumeClick
    ) {
      pendingClickOwners.delete(pendingAnchor);
    }
    pendingAnchor = null;
  };

  const consumeClick = (event: FollowupClick): void => {
    if (!pendingAnchor || event.detail === 0) return;
    if (
      !(event.target instanceof Node) ||
      !root.contains(event.target) ||
      !pendingAnchor.contains(event.target)
    )
      return;
    clearPendingClick();
    suppressedClicks.add(event);
    event.preventDefault();
  };

  const onPointerDown = (event: PointerEvent): void => {
    clearPendingClick();
    if (currentOptions.enabled === false) return;

    const anchor = findAnchor(event.target, root);
    if (!anchor) return;
    if (anchor !== root && anchorOwners.has(anchor)) return;

    const intent = resolveFastLink(event, anchor);
    if (!intent) return;

    pendingAnchor = anchor;
    pendingClickOwners.set(anchor, consumeClick);
    currentOptions.onNavigate?.(intent);
    (currentOptions.navigate ?? navigateInBrowser)(intent);
  };

  const onClick = (event: FollowupClick): void => {
    if (destroyed || event.detail === 0) return;
    if (pendingAnchor) consumeClick(event);
    if (suppressedClicks.has(event)) return;
    const anchor = findAnchor(event.target, root);
    if (anchor) pendingClickOwners.get(anchor)?.(event);
  };

  root.addEventListener('pointerdown', onPointerDown, { capture: true });
  root.addEventListener('click', consumeClick, { capture: true });

  return {
    suppressClick: onClick,
    update(nextOptions): void {
      currentOptions = { ...nextOptions };
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      clearPendingClick();
      if (ownsAnchor) {
        const remaining = (anchorOwners.get(root) ?? 1) - 1;
        if (remaining) anchorOwners.set(root, remaining);
        else anchorOwners.delete(root);
      }
      root.removeEventListener('pointerdown', onPointerDown, { capture: true });
      root.removeEventListener('click', consumeClick, { capture: true });
    },
  };
}

function navigateInBrowser({ anchor, url }: FastLinkIntent): void {
  anchor.ownerDocument.defaultView?.location.assign(url.href);
}
