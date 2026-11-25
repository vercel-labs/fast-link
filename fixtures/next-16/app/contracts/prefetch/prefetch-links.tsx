'use client';

import { FastLink } from '@fast-link/next';
import { useEffect, useState, type JSX } from 'react';

import { recordingClick, recordingObserver } from '../log';

// Kept apart from other contract links so their prefetches are not in flight there.
export function PrefetchLinks(): JSX.Element {
  const [isReady, setIsReady] = useState(false);
  useEffect(() => setIsReady(true), []);
  return (
    <nav data-testid="prefetch-ready" data-ready={isReady}>
      <FastLink
        href="/contracts/static?from=prefetch-release"
        data-testid="prefetch-release"
        onFastNavigate={recordingObserver('prefetch-release')}
        style={{ display: 'block', width: 'max-content' }}
      >
        Prefetched release
      </FastLink>
      <FastLink
        href="/contracts/static?from=prefetch-immediate"
        data-testid="prefetch-immediate"
        mode="immediate"
        onFastNavigate={recordingObserver('prefetch-immediate')}
        onClick={recordingClick('prefetch-immediate')}
        style={{ display: 'block', width: 'max-content' }}
      >
        Prefetched immediate
      </FastLink>
    </nav>
  );
}
