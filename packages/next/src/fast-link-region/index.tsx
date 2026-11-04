'use client';

import { useRouter } from 'next/navigation';
import type { JSX, ReactNode } from 'react';

import type { NavigationOptions } from '../navigation-policy';
import { createPreparedNavigation } from '../prepared-navigation';
import { useNavigationCapture } from '../use-navigation-capture';

/** Props for preparation and capture-time navigation across ordinary links. */
export type FastLinkRegionProps = NavigationOptions & {
  /** Content containing links, usually inside a semantic navigation element. */
  children: ReactNode;
  /** The app's Next.js `basePath`, removed before `router.push()`. */
  basePath?: string;
};

/**
 * Prepares on press and navigates during click capture in a `display: contents` div.
 *
 * - Child click guards run after acceptance and cannot veto it. Use FastLink for guarded links.
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
  const navigation = createPreparedNavigation(router, {
    navigationPolicy,
    onFastNavigate,
    destination: (intent) => getRegionDestination(intent.url, basePath),
    method: 'push',
  });
  const attach = useNavigationCapture<HTMLDivElement>({ enabled, navigation });
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
