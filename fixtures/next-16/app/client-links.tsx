'use client';

import { FastLink, FastLinkRegion, useFastLink } from '@fast-link/next';
import Link from 'next/link';
import { useLinkStatus } from 'next/link';
import { useEffect, useRef, useState, type JSX } from 'react';
import { createPortal, flushSync } from 'react-dom';

export function ClientLinks(): JSX.Element {
  const [events, setEvents] = useState<string[]>([]);
  const record = (name: string) => setEvents((current) => [...current, name]);

  return (
    <div>
      <GuardPolicyLink />
      <RefChangingLink guard="onClick" />
      <RefChangingLink guard="onNavigate" />
      <RefChangingLink guard="prefetch" />
      <RefChangingRenderer />
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

function GuardPolicyLink(): JSX.Element {
  const [documentNavigation, setDocumentNavigation] = useState(false);
  return (
    <FastLink
      href="/fast?from=guard-policy"
      data-testid="guard-policy"
      prefetch={false}
      navigationPolicy={() =>
        documentNavigation
          ? { kind: 'document', method: 'assign' }
          : { kind: 'router' }
      }
      onNavigate={() => flushSync(() => setDocumentNavigation(true))}
      onFastNavigate={(_, decision) =>
        sessionStorage.setItem('guard-policy', decision.kind)
      }
    >
      Guard changes policy
    </FastLink>
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
      style={{ width: 200, height: 80 }}
    >
      {root &&
        createPortal(
          <FastLinkRegion
            basePath="/docs"
            onFastNavigate={() => record('shadow-region-fast')}
          >
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
            <Link
              href="/slow?from=closed-region"
              prefetch={false}
              style={{ display: 'block', width: 200, height: 40 }}
              onClick={(event) =>
                record(
                  event.defaultPrevented
                    ? 'shadow-region-prevented'
                    : 'shadow-region-allowed',
                )
              }
            >
              Closed shadow ordinary link
            </Link>
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

// Real Next Link reattaches its merged ref when href or prefetch changes.
function RefChangingLink({
  guard,
}: {
  guard: 'onClick' | 'onNavigate' | 'prefetch';
}) {
  const [changed, setChanged] = useState(false);
  const update = () => flushSync(() => setChanged(true));
  return (
    <FastLink
      href={
        changed || guard === 'prefetch'
          ? `/fast?from=ref-${guard}`
          : '/object?from=stale-ref'
      }
      prefetch={guard === 'prefetch' && changed}
      data-testid={`ref-${guard}`}
      onClick={guard === 'onClick' ? update : undefined}
      onNavigate={guard !== 'onClick' ? update : undefined}
      navigationPolicy={() =>
        guard === 'prefetch' && changed
          ? { kind: 'router', scroll: false }
          : { kind: 'router' }
      }
      onFastNavigate={(_intent, decision) => {
        sessionStorage.setItem(
          'ref-actions',
          String(Number(sessionStorage.getItem('ref-actions') ?? 0) + 1),
        );
        sessionStorage.setItem('ref-decision', JSON.stringify(decision));
      }}
    >
      Change {guard}
    </FastLink>
  );
}

function RefChangingRenderer() {
  const [changed, setChanged] = useState(false);
  const href = changed ? '/fast?from=ref-hook' : '/object?from=stale-ref';
  const binding = useFastLink({
    href,
    onClickCapture: () => flushSync(() => setChanged(true)),
    onFastNavigate: () =>
      sessionStorage.setItem(
        'ref-actions',
        String(Number(sessionStorage.getItem('ref-actions') ?? 0) + 1),
      ),
  });
  return (
    <Link href={href} prefetch={false} {...binding} data-testid="ref-hook">
      Change custom href
    </Link>
  );
}
