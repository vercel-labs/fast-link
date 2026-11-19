import type Link from 'next/link';
import type { ComponentPropsWithoutRef } from 'react';

/** Preserves authored paths so the router applies basePath once; object URLs use the rendered search and hash. */
export function getLinkDestination(
  href: ComponentPropsWithoutRef<typeof Link>['href'],
  resolvedUrl: URL,
): string {
  if (typeof href === 'string') return href;
  if (href.protocol || href.host) return resolvedUrl.href;
  return (href.pathname ?? '') + resolvedUrl.search + resolvedUrl.hash;
}
