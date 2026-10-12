'use client';

import { runFastNavigation } from '@fast-link/core';
import { useFastLink } from '@fast-link/react';
import { useRouter } from 'next/navigation';
import type { JSX, ReactNode } from 'react';

import type {
  FastRouterProposal,
  NavigationOptions,
} from '../navigation-policy';

/** Props for early navigation across links in an App Router region. */
export type FastLinkRegionProps = NavigationOptions & {
  /** Content containing links, usually inside a semantic navigation element. */
  children: ReactNode;
  /** The app's Next.js `basePath`, removed before `router.push()`. */
  basePath?: string;
};

/**
 * Starts eligible App Router navigation for links in a `display: contents` div.
 *
 * - Ordinary links use the region's navigation policy and push history.
 * - Links with their own controllers keep their Link props and policy, even
 *   when those controllers are disabled.
 */
export function FastLinkRegion({
  children,
  enabled = true,
  basePath = '',
  navigationPolicy,
  onFastNavigate,
}: FastLinkRegionProps): JSX.Element {
  const router = useRouter();
  const attach = useFastLink<HTMLDivElement>({
    enabled,
    navigate: (intent) => {
      const destination = getRegionDestination(intent.url, basePath);
      const proposed: FastRouterProposal = { destination, method: 'push' };
      runFastNavigation(intent, {
        defaultRouterDecision: { kind: 'router' },
        policy: navigationPolicy
          ? () => navigationPolicy(intent, proposed)
          : undefined,
        observe: (decision) => onFastNavigate?.(intent, decision),
        route: (decision) => {
          if (decision.scroll === undefined) router.push(destination);
          else router.push(destination, { scroll: decision.scroll });
        },
      });
    },
  });
  return (
    <div {...attach} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}

function getRegionDestination(url: URL, basePath: string): string {
  const pathname = url.pathname;
  const routePath =
    basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))
      ? pathname.slice(basePath.length) || '/'
      : pathname;
  return routePath + url.search + url.hash;
}
