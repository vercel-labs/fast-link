import { coordination, type FollowupClick } from '../coordination';
import { findAnchor } from '../interaction';

const { pendingClickOwners, suppressedClicks } = coordination;

/** The pending follow-up click of one accepted immediate press. */
export interface FollowupClaim {
  /** Prevents a matching click and settles the claim. */
  consume(event: FollowupClick): void;
  /** Ends the claim. Removes the shared registration only if it is still this claim's. */
  settle(): void;
}

/**
 * Arms suppression for the click that follows an accepted press on `anchor`.
 * The capture listener and shared registration exist only while the claim is pending.
 */
export function armFollowupClick(
  root: HTMLElement,
  anchor: HTMLAnchorElement,
): FollowupClaim {
  let isPending = true;

  function settle(): void {
    if (!isPending) return;
    isPending = false;
    if (pendingClickOwners.get(anchor) === consume) {
      pendingClickOwners.delete(anchor);
    }
    root.removeEventListener('click', consume, true);
  }

  // Shared with other copies, which may pass a framework event.
  function consume(event: FollowupClick): void {
    if (!isPending || !isFollowupTarget(event, root, anchor)) return;
    settle();
    suppressedClicks.add(event);
    event.preventDefault();
  }

  pendingClickOwners.set(anchor, consume);
  root.addEventListener('click', consume, true);
  return { consume, settle };
}

/**
 * Applies pending suppression from a framework capture handler that runs before
 * native capture listeners, including a claim owned by a managed descendant or
 * another bundled copy. Returns whether the click is suppressed.
 */
export function suppressFollowupClick(
  root: HTMLElement,
  claim: FollowupClaim | null,
  event: MouseEvent,
): boolean {
  if (event.detail === 0) return false;
  claim?.consume(event);
  if (!suppressedClicks.has(event)) {
    const anchor = findAnchor(event.target, root);
    if (anchor) pendingClickOwners.get(anchor)?.(event);
  }
  return suppressedClicks.has(event);
}

// Keyboard clicks have detail 0 and stay native.
function isFollowupTarget(
  event: FollowupClick,
  root: HTMLElement,
  anchor: HTMLAnchorElement,
): boolean {
  return (
    event.detail !== 0 &&
    event.target instanceof Node &&
    root.contains(event.target) &&
    anchor.contains(event.target)
  );
}
