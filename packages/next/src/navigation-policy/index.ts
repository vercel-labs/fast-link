import type {
  FastLinkIntent,
  FastNavigationDecision,
  LinkMode,
} from '@fast-link/core';

/**
 * Describes the Next route before policy. Mutations do not change its destination
 * or history method.
 */
export type FastRouterProposal = Readonly<{
  destination: string;
  method: 'push' | 'replace';
  scroll?: boolean;
}>;

/**
 * Chooses App Router or document navigation synchronously without side effects.
 *
 * - In release mode with preparation available, called on eligible mouse press
 *   and again before navigation. A canceled click skips the second call.
 * - In immediate mode, called once on press, after `onNavigate`.
 * - Read current routing data each time. Place side effects in navigation callbacks.
 * - The application determines whether its router owns the destination.
 * - Use document navigation when ownership is foreign or unknown.
 * - Router decisions can override only the proposed scroll behavior.
 */
export type FastNavigationPolicy = (
  intent: FastLinkIntent,
  proposed: FastRouterProposal,
) => FastNavigationDecision;

/** Navigation controls shared by Next links, regions, and the custom-renderer hook. */
export type NavigationOptions = {
  /**
   * `release` (default) prepares on press and navigates on an accepted click.
   * `immediate` navigates on press. `native` leaves navigation to the link or
   * renderer.
   */
  mode?: LinkMode;
  /** Chooses router or document navigation. May run on press and click; must have no side effects. */
  navigationPolicy?: FastNavigationPolicy;
  /** Observes the decision before navigation. Navigation still runs if it throws. */
  onFastNavigate?: (
    intent: FastLinkIntent,
    decision: FastNavigationDecision,
  ) => void;
};
