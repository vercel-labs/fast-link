import type { FastLinkIntent } from '../interaction';
import type { ClickGesture, PreparedClick } from '../preparation/gesture';

/** How a link interaction controller handles eligible primary mouse input. */
export type LinkMode = 'release' | 'immediate' | 'native';

/**
 * Options copied by a link interaction controller. The mode is explicit; native
 * mode needs no callbacks.
 */
export type LinkInteractionOptions<P> =
  | ReleaseLinkOptions<P>
  | ImmediateLinkOptions
  | NativeLinkOptions;

/** Prepares on eligible press; the adapter accepts the matching click and navigates. */
export interface ReleaseLinkOptions<P> {
  mode: 'release';
  /** Starts work without navigating. Errors are ignored and leave click-time navigation available. */
  prepare(intent: FastLinkIntent): P | null;
}

/** Navigates on eligible press, before release, and suppresses the follow-up click. */
export interface ImmediateLinkOptions {
  mode: 'immediate';
  /**
   * Runs after follow-up click suppression is armed. Return `false` to cancel.
   * Errors propagate. A canceled or throwing guard keeps the click suppressed.
   */
  beforeNavigate?(intent: FastLinkIntent): boolean;
  /** Navigates with the intent rechecked after `beforeNavigate`. Errors propagate. */
  navigate(intent: FastLinkIntent): void;
}

/** Leaves new interactions to ordinary link behavior; root ownership and earlier suppression remain. */
export interface NativeLinkOptions {
  mode: 'native';
}

/** Controls one root's selected mode, its listeners, and follow-up click suppression. */
export interface LinkInteractionController<P> {
  /**
   * Copies and replaces every option. A same-mode update keeps pending work.
   * A mode change discards click preparation and cancels a running guard, but
   * never clears follow-up click suppression.
   */
  update(options: LinkInteractionOptions<P>): void;
  /** In release mode, matches before adapter guards. Consume or discard every returned candidate. */
  matchClick(event: MouseEvent): PreparedClick<P> | null;
  /**
   * Prevents the follow-up click of an accepted immediate press, including one
   * owned by a managed descendant or a separately bundled copy. Propagation is
   * preserved. Returns whether the click is suppressed so a framework can also
   * prevent its own event wrapper.
   */
  suppressClick(event: MouseEvent): boolean;
  /**
   * Drops release-mode preparation and matched candidates only. Never clears
   * follow-up click suppression.
   */
  discard(): void;
  /** Destroys pending work, suppression, listeners, and root ownership. Repeated calls do nothing. */
  destroy(): void;
}

export type SelectedPath<P> =
  | { readonly mode: 'release'; readonly gesture: ClickGesture<P> }
  | { readonly mode: 'immediate'; options: ImmediateLinkOptions }
  | { readonly mode: 'native' };
