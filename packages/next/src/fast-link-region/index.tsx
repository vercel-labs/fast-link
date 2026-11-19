'use client';

import { useRouter } from 'next/navigation';
import type { JSX, ReactNode } from 'react';

import type { NavigationOptions } from '../navigation-policy';
import { useNavigationCapture } from '../use-navigation-capture';

/** Props for early navigation across ordinary links in an App Router region. */
export type FastLinkRegionProps = NavigationOptions & {
  /** Content containing links, usually inside a semantic navigation element. */
  children: ReactNode;
  /** The app's Next.js `basePath`, removed before `router.push()`. */
  basePath?: string;
};

/**
 * Applies one mode and navigation policy to ordinary links in a
 * `display: contents` div. Ordinary links push history.
 *
 * - `release` (default) prepares on press and navigates during click capture.
 *   Child click guards run after acceptance and cannot veto it; use
 *   `FastLink` for guarded links.
 * - `immediate` navigates on press. `native` leaves links to their own handlers.
 * - An ordinary link uses its closest region, including a native one.
 * - Managed links, such as `FastLink`, keep their own mode and options.
 */
export function FastLinkRegion({
  children,
  mode,
  basePath = '',
  navigationPolicy,
  onFastNavigate,
}: FastLinkRegionProps): JSX.Element {
  const router = useRouter();
  const attach = useNavigationCapture<HTMLDivElement>({
    mode,
    routing: {
      router,
      navigationPolicy,
      onFastNavigate,
      destination: (intent) => getRegionDestination(intent.url, basePath),
      method: 'push',
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
