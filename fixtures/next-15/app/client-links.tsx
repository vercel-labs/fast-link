// Generated from fixtures/next-shared/app/client-links.tsx.
// Run `pnpm fixtures:generate` after editing the source.

'use client';

import { FastLink, FastLinkRegion } from '@fast-link/next';
import Link from 'next/link';
import { useLinkStatus } from 'next/link';
import { useState, type JSX } from 'react';

export function ClientLinks(): JSX.Element {
  const [events, setEvents] = useState<string[]>([]);
  const record = (name: string) => setEvents((current) => [...current, name]);

  return (
    <div>
      <FastLink
        href="/fast"
        data-testid="cancel"
        onNavigate={(event) => {
          record('navigate');
          event.preventDefault();
        }}
        onClick={() => record('click')}
        onFastNavigate={() => record('fast')}
      >
        Cancel
      </FastLink>
      <FastLink href="/fast" data-testid="native" enabled={false}>
        Native
      </FastLink>
      <FastLink href="/fast" as="/fast" data-testid="as">
        As
      </FastLink>
      <FastLink href="/fast" legacyBehavior>
        <a data-testid="legacy">Legacy</a>
      </FastLink>
      <FastLink href="/slow" data-testid="slow" prefetch={false}>
        Slow <Status />
      </FastLink>
      <FastLink
        href="/slow"
        data-testid="churn"
        prefetch={false}
        ref={(element) => {
          if (element) {
            element.dataset.refCalls = String(
              Number(element.dataset.refCalls ?? 0) + 1,
            );
          }
        }}
        onFastNavigate={() => record('fast')}
        onClick={(event) =>
          record(event.defaultPrevented ? 'prevented' : 'allowed')
        }
      >
        Churn
      </FastLink>
      <div style={{ height: 800 }} />
      <FastLink
        href="/fast?from=options"
        data-testid="options"
        prefetch={false}
        replace
        scroll={false}
      >
        Options
      </FastLink>
      <FastLinkRegion
        basePath="/docs"
        onFastNavigate={() => record('region-fast')}
      >
        <nav onClick={() => record('region-parent')}>
          <Link
            href="/fast"
            data-testid="region-cancel"
            data-no-fast-link
            onClick={() => record('region-click')}
            onNavigate={(event) => {
              record('region-cancel');
              event.preventDefault();
            }}
          >
            Region cancel
          </Link>
          <Link
            href="/fast"
            data-testid="region-guard"
            data-no-fast-link
            onClick={(event) => {
              record('region-guard');
              event.preventDefault();
            }}
            onNavigate={() => record('unexpected')}
          >
            Region guard
          </Link>
          <Link
            href="/fast?from=region-options"
            data-testid="region-options"
            data-no-fast-link
            prefetch={false}
            replace
            scroll={false}
          >
            Region options
          </Link>
          <Link
            href="/slow"
            data-testid="region-churn"
            prefetch={false}
            onClick={(event) =>
              record(
                event.defaultPrevented ? 'region-prevented' : 'region-allowed',
              )
            }
          >
            Region churn <Status testId="region-pending" />
          </Link>
        </nav>
      </FastLinkRegion>
      <div style={{ height: 800 }} />
      <output data-testid="events">{events.join(',')}</output>
    </div>
  );
}

function Status({ testId = 'pending' }: { testId?: string }): JSX.Element {
  const { pending } = useLinkStatus();
  return <span data-testid={testId}>{pending ? 'pending' : 'idle'}</span>;
}
