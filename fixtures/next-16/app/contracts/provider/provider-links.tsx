'use client';

import { FastLink, type LinkMode } from '@fast-link/next';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type JSX } from 'react';

import { recordingObserver, registerHandle } from '../log';
import { invalidateDestination } from './actions';

const links: [testId: string, href: string, mode: LinkMode][] = [
  ['prepared', '/contracts/destination?from=prepared', 'release'],
  ['prepared-native', '/contracts/destination?from=prepared-native', 'native'],
  ['redirect', '/contracts/redirect', 'release'],
  ['redirect-immediate', '/contracts/redirect', 'immediate'],
  ['redirect-native', '/contracts/redirect', 'native'],
];

export function ProviderLinks(): JSX.Element {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    setIsReady(true);
    return registerHandle('provider', {
      refresh: () => router.refresh(),
      push: (href: string) => router.push(href),
      invalidate: () => invalidateDestination(),
    });
  }, [router]);
  return (
    <nav data-testid="provider-ready" data-ready={isReady}>
      {links.map(([testId, href, mode]) => (
        <FastLink
          key={testId}
          href={href}
          mode={mode}
          prefetch={false}
          data-testid={testId}
          onFastNavigate={recordingObserver(testId)}
          style={{ display: 'block' }}
        >
          {testId}
        </FastLink>
      ))}
    </nav>
  );
}
