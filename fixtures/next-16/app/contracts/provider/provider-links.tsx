'use client';

import { FastLink, type LinkMode } from '@fast-link/next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type JSX } from 'react';

import { recordingObserver, registerHandle } from '../log';
import { invalidateDestination } from './actions';

const fastLinks: [testId: string, href: string, mode: LinkMode][] = [
  ['prepared', '/contracts/destination?from=prepared', 'release'],
  ['redirect', '/contracts/redirect', 'release'],
  ['redirect-immediate', '/contracts/redirect', 'immediate'],
];

// Ordinary Next Link baselines for the same destinations.
const nextLinks: [testId: string, href: string][] = [
  ['next-link', '/contracts/destination?from=next-link'],
  ['redirect-next-link', '/contracts/redirect'],
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
      {fastLinks.map(([testId, href, mode]) => (
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
      {nextLinks.map(([testId, href]) => (
        <Link
          key={testId}
          href={href}
          prefetch={false}
          data-testid={testId}
          style={{ display: 'block' }}
        >
          {testId}
        </Link>
      ))}
    </nav>
  );
}
