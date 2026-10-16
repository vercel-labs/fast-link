'use client';

import { FastLink, FastLinkRegion } from '@fast-link/next';
import Link from 'next/link';
import { useLinkStatus } from 'next/link';
import { useEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';

export function ClientLinks(): JSX.Element {
  const [events, setEvents] = useState<string[]>([]);
  const record = (name: string) => setEvents((current) => [...current, name]);

  return (
    <div>
      <FastLink
        href="/fast"
        data-testid="cancel"
        prefetch={false}
        onNavigate={(event) => {
          record('navigate');
          event.preventDefault();
        }}
        onClick={() => record('click')}
        onFastNavigate={() => record('fast')}
      >
        Cancel
      </FastLink>
      <FastLink
        href="/fast"
        data-testid="native"
        enabled={false}
        prefetch={false}
      >
        Native
      </FastLink>
      <FastLink
        href="/slow"
        as="/fast"
        data-testid="as"
        prefetch={false}
        onFastNavigate={() => record('unexpected-fast')}
      >
        As
      </FastLink>
      <FastLink
        href="/fast"
        legacyBehavior
        prefetch={false}
        onFastNavigate={() => record('unexpected-fast')}
      >
        <a data-testid="legacy">Legacy</a>
      </FastLink>
      <FastLink
        href="/slow"
        data-testid="slow"
        prefetch={false}
        onFastNavigate={() => record('slow-fast')}
      >
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
      <FastLinkRegion>
        <div
          onClickCapture={(event) => {
            record(
              event.defaultPrevented ? 'capture-prevented' : 'capture-allowed',
            );
            event.stopPropagation();
          }}
        >
          <FastLink
            href="/slow?from=capture"
            data-testid="capture-stop"
            prefetch={false}
            onFastNavigate={() => record('capture-fast')}
          >
            Capture stop
          </FastLink>
        </div>
      </FastLinkRegion>
      <ShadowCaptureLink record={record} />
      <div style={{ height: 800 }} />
      <FastLink
        href="/fast?from=options"
        data-testid="options"
        prefetch={false}
        replace
        scroll={false}
        transitionTypes={['slide']}
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
            prefetch={false}
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
            prefetch={false}
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

function ShadowCaptureLink({
  record,
}: {
  record: (event: string) => void;
}): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<ShadowRoot | null>(null);
  useEffect(() => {
    if (host.current) setRoot(host.current.attachShadow({ mode: 'closed' }));
  }, []);
  return (
    <div
      ref={host}
      data-testid="closed-capture-host"
      data-ready={root ? 'true' : 'false'}
      style={{ width: 200, height: 40 }}
    >
      {root &&
        createPortal(
          <FastLinkRegion>
            <div
              onClickCapture={(event) => {
                record(
                  event.defaultPrevented
                    ? 'capture-prevented'
                    : 'capture-allowed',
                );
                event.stopPropagation();
              }}
            >
              <FastLink
                href="/slow?from=closed-capture"
                prefetch={false}
                style={{ display: 'block', width: 200, height: 40 }}
                onFastNavigate={() => record('capture-fast')}
              >
                Closed shadow capture
              </FastLink>
            </div>
          </FastLinkRegion>,
          root,
        )}
    </div>
  );
}

function Status({ testId = 'pending' }: { testId?: string }): JSX.Element {
  const { pending } = useLinkStatus();
  return <span data-testid={testId}>{pending ? 'pending' : 'idle'}</span>;
}
