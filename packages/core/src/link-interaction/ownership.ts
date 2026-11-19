import {
  hasAnchorOwner,
  hasCloserRegion,
  registerAnchorOwner,
  registerRegionOwner,
} from '../coordination';
import {
  findAnchor,
  resolveFastLink,
  type FastLinkIntent,
} from '../interaction';

/**
 * Registers a root at attachment, in every mode, so containing roots can defer
 * to it before their first capture handler does any work.
 */
export function registerInteractionRoot(root: HTMLElement): () => void {
  // An anchor root is a managed link; registerAnchorOwner returns undefined for any other root, a region.
  return registerAnchorOwner(root) ?? registerRegionOwner(root);
}

/**
 * A managed anchor owns its own interactions. Otherwise the closest registered
 * region owns an ordinary link, including a native region.
 */
export function isInteractionOwner(
  root: HTMLElement,
  anchor: HTMLAnchorElement,
): boolean {
  if (anchor === root) return true;
  return !hasAnchorOwner(anchor) && !hasCloserRegion(root, anchor);
}

/** Resolves and claims an eligible press only when this root owns its anchor. */
export function resolvePressForRoot(
  root: HTMLElement,
  event: PointerEvent,
): FastLinkIntent | null {
  const anchor = findAnchor(event.target, root);
  if (!anchor || !isInteractionOwner(root, anchor)) return null;
  return resolveFastLink(event, anchor);
}
