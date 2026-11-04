import type { FastLinkIntent, FastNavigationDecision } from '@fast-link/core';

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
 * Classifies navigation synchronously without side effects.
 *
 * - All Next integrations call it on eligible press when preparation is available and again after
 *   accepted-click guards. Reads current inputs each time; cancellation can
 *   leave only the press-time call. Keep effects in navigation callbacks.
 * - The application determines whether its router owns the destination.
 * - Use document navigation when ownership is foreign or unknown.
 * - Router decisions can override only the proposed scroll behavior.
 */
export type FastNavigationPolicy = (
  intent: FastLinkIntent,
  proposed: FastRouterProposal,
) => FastNavigationDecision;

/** Navigation controls shared by Next links and regions. */
export type NavigationOptions = {
  /** Set `false` to leave new gestures to normal navigation. Defaults to `true`. */
  enabled?: boolean;
  /** Pure, repeatable classification for preparation and accepted navigation. */
  navigationPolicy?: FastNavigationPolicy;
  /** Observes the decision before navigation. Navigation still runs if it throws. */
  onFastNavigate?: (
    intent: FastLinkIntent,
    decision: FastNavigationDecision,
  ) => void;
};
