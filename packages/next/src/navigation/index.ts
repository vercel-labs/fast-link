import {
  runFastNavigation,
  validateFastNavigationDecision,
  type FastLinkIntent,
} from '@fast-link/core';
import type { useRouter } from 'next/navigation';

import type {
  FastRouterProposal,
  NavigationOptions,
} from '../navigation-policy';

type Router = ReturnType<typeof useRouter>;
type CommitOptions = { scroll?: boolean; transitionTypes?: string[] };
type PreparedHandle = {
  push(options?: CommitOptions): void;
  replace(options?: CommitOptions): void;
};
// Feature detection keeps stable Next 16 usable without the experimental API.
type PreparingRouter = Router & {
  experimental_prepare?: (href: string) => PreparedHandle;
};

/** Router work started right after press, reusable only by the same router and destination. */
export type PreparedNavigation = {
  router: Router;
  destination: string;
  handle: PreparedHandle;
};

/** The current routing inputs of one link, region, or custom renderer. */
export type Routing = Omit<NavigationOptions, 'mode'> & {
  router: PreparingRouter;
  destination(intent: FastLinkIntent): string;
  method: 'push' | 'replace';
  scroll?: boolean;
  transitionTypes?: readonly string[];
};

/**
 * Starts router preparation for a press when Next supports it and the current
 * policy selects router navigation. Returns `null` otherwise. Policy and
 * provider errors propagate; core treats them as missing preparation.
 */
export function prepareNavigation(
  routing: Routing,
  intent: FastLinkIntent,
): PreparedNavigation | null {
  const { router, navigationPolicy } = routing;
  if (!router.experimental_prepare) return null;
  const proposed = getProposal(routing, intent);
  const decision = validateFastNavigationDecision(
    navigationPolicy ? navigationPolicy(intent, proposed) : { kind: 'router' },
  );
  if (decision.kind !== 'router') return null;
  return {
    router,
    destination: proposed.destination,
    handle: router.experimental_prepare(proposed.destination),
  };
}

/**
 * Navigates an accepted intent with the current policy and commit options.
 * Reuses `prepared` only when it belongs to the current router and destination.
 * Follows the `runFastNavigation` failure order and never retries a failed
 * router or prepared commit.
 */
export function navigate(
  routing: Routing,
  intent: FastLinkIntent,
  prepared: PreparedNavigation | null = null,
): void {
  const { router, navigationPolicy, onFastNavigate } = routing;
  const proposed = getProposal(routing, intent);
  const transitionTypes = routing.transitionTypes && [
    ...routing.transitionTypes,
  ];
  const reusable =
    prepared?.router === router && prepared.destination === proposed.destination
      ? prepared
      : null;
  runFastNavigation(intent, {
    defaultRouterDecision: { kind: 'router' },
    policy: navigationPolicy && (() => navigationPolicy(intent, proposed)),
    observe: (decision) => onFastNavigate?.(intent, decision),
    route: (decision) => {
      const options = {
        scroll: decision.scroll ?? proposed.scroll,
        transitionTypes,
      };
      // Never retry a commit: it may have navigated before throwing.
      if (reusable) reusable.handle[proposed.method](options);
      else router[proposed.method](proposed.destination, options);
    },
  });
}

function getProposal(
  routing: Routing,
  intent: FastLinkIntent,
): FastRouterProposal {
  return Object.freeze({
    destination: routing.destination(intent),
    method: routing.method,
    scroll: routing.scroll,
  });
}
