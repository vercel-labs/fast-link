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

export type PreparedNavigation = {
  router: Router;
  destination: string;
  policy: NavigationOptions['navigationPolicy'];
  method: 'push' | 'replace';
  scroll?: boolean;
  transitionTypes?: string[];
  handle: PreparedHandle;
};

type RoutingOptions = NavigationOptions &
  CommitOptions & {
    destination(intent: FastLinkIntent): string;
    method: 'push' | 'replace';
  };

/** Owns Next preparation, routing snapshots, and click-time policy execution. */
export function createPreparedNavigation(
  router: PreparingRouter,
  options: RoutingOptions,
): {
  prepare(intent: FastLinkIntent): PreparedNavigation | null;
  navigate(activation: {
    intent: FastLinkIntent;
    prepared: PreparedNavigation | null;
  }): void;
} {
  function proposal(intent: FastLinkIntent): FastRouterProposal {
    return Object.freeze({
      destination: options.destination(intent),
      method: options.method,
      scroll: options.scroll,
    });
  }

  return {
    prepare(intent: FastLinkIntent): PreparedNavigation | null {
      if (!router.experimental_prepare) return null;
      const proposed = proposal(intent);
      const decision = validateFastNavigationDecision(
        options.navigationPolicy
          ? options.navigationPolicy(intent, proposed)
          : { kind: 'router' },
      );
      if (decision.kind !== 'router') return null;
      const handle = router.experimental_prepare(proposed.destination);
      return {
        router,
        destination: proposed.destination,
        policy: options.navigationPolicy,
        method: options.method,
        scroll: options.scroll,
        transitionTypes: options.transitionTypes
          ? [...options.transitionTypes]
          : undefined,
        handle,
      };
    },
    navigate({
      intent,
      prepared,
    }: {
      intent: FastLinkIntent;
      prepared: PreparedNavigation | null;
    }): void {
      const proposed = proposal(intent);
      const transitionTypes = options.transitionTypes
        ? [...options.transitionTypes]
        : undefined;
      const canReuse =
        prepared !== null &&
        prepared.router === router &&
        prepared.destination === proposed.destination &&
        prepared.policy === options.navigationPolicy &&
        prepared.method === proposed.method &&
        prepared.scroll === proposed.scroll &&
        sameTransitions(prepared.transitionTypes, transitionTypes);
      const { navigationPolicy } = options;
      runFastNavigation(intent, {
        defaultRouterDecision: { kind: 'router' },
        policy: navigationPolicy
          ? () => navigationPolicy(intent, proposed)
          : undefined,
        observe: (decision) => options.onFastNavigate?.(intent, decision),
        route: (decision) => {
          const commitOptions = {
            scroll: decision.scroll ?? proposed.scroll,
            transitionTypes,
          };
          // Never retry a commit: it may have navigated before throwing.
          if (canReuse) prepared.handle[proposed.method](commitOptions);
          else router[proposed.method](proposed.destination, commitOptions);
        },
      });
    },
  };
}

function sameTransitions(
  first: string[] | undefined,
  second: string[] | undefined,
): boolean {
  return (
    first === second ||
    (first !== undefined &&
      second !== undefined &&
      first.length === second.length &&
      first.every((value, index) => value === second[index]))
  );
}
