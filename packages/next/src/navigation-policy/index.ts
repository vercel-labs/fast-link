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
 * Selects navigation synchronously for an accepted press.
 *
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
  /** Set `false` to disable early navigation. Defaults to `true`. */
  enabled?: boolean;
  /** Selects navigation for an eligible press. Omit to use the App Router. */
  navigationPolicy?: FastNavigationPolicy;
  /** Observes the decision before navigation. Navigation still runs if it throws. */
  onFastNavigate?: (
    intent: FastLinkIntent,
    decision: FastNavigationDecision,
  ) => void;
};
