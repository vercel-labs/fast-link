'use client';

import {
  FastLink,
  FastLinkRegion,
  useFastLink,
  type LinkMode,
} from '@fast-link/next';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type JSX } from 'react';
import { flushSync } from 'react-dom';

import {
  record,
  recordingClick,
  recordingObserver,
  recordingPolicy,
  registerHandle,
} from './log';

type Guard = 'none' | 'cancel' | 'throw' | 'to-native';

const destination = (from: string) => `/contracts/destination?from=${from}`;

export function ContractLinks(): JSX.Element {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    setIsReady(true);
    return registerHandle('runtime', {
      hasPreparation: () =>
        typeof (router as { experimental_prepare?: unknown })
          .experimental_prepare === 'function',
    });
  }, [router]);
  return (
    <div data-testid="contracts-ready" data-ready={isReady}>
      <NestedRegions />
      <ModeChangingLink id="immediate-plain" initialMode="immediate" />
      <ModeChangingLink
        id="immediate-cancel"
        initialMode="immediate"
        guard="cancel"
      />
      <ModeChangingLink
        id="immediate-throw"
        initialMode="immediate"
        guard="throw"
      />
      <ModeChangingLink
        id="immediate-to-native"
        initialMode="immediate"
        guard="to-native"
      />
      <ModeChangingLink id="release-plain" initialMode="release" />
      <ModeChangingLink
        id="release-to-native"
        initialMode="release"
        guard="to-native"
      />
      <ModeChangingHook id="hook-to-native" />
      <PrefetchEnablingLink id="enable-release-document" kind="document" />
      <PrefetchEnablingLink id="enable-release-router" kind="router" />
      <PrefetchEnablingLink
        id="enable-immediate-document"
        kind="document"
        mode="immediate"
      />
      <PrefetchEnablingLink
        id="enable-immediate-router"
        kind="router"
        mode="immediate"
      />
      <PrefetchEnablingNextLink id="enable-next-link-document" />
      <FastLink
        href="/contracts/static?from=prefetch-release"
        data-testid="prefetch-release"
        onFastNavigate={recordingObserver('prefetch-release')}
      >
        Prefetched release
      </FastLink>
      <FastLink
        href="/contracts/static?from=prefetch-immediate"
        data-testid="prefetch-immediate"
        mode="immediate"
        onFastNavigate={recordingObserver('prefetch-immediate')}
        onClick={recordingClick('prefetch-immediate')}
      >
        Prefetched immediate
      </FastLink>
    </div>
  );
}

function NestedRegions(): JSX.Element {
  return (
    <section aria-label="Nested regions">
      <FastLinkRegion
        basePath="/docs"
        navigationPolicy={recordingPolicy('outer-release')}
        onFastNavigate={recordingObserver('outer-release')}
      >
        <nav>
          <Link
            href={destination('region-release-away')}
            data-testid="region-release-away"
            prefetch={false}
          >
            Release region
          </Link>
          <FastLinkRegion
            basePath="/docs"
            mode="immediate"
            navigationPolicy={recordingPolicy('inner-immediate', 'document')}
            onFastNavigate={recordingObserver('inner-immediate')}
          >
            <Link
              href={destination('inner-immediate')}
              data-testid="inner-immediate"
              prefetch={false}
            >
              Immediate region inside release region
            </Link>
          </FastLinkRegion>
          <FastLink
            href={destination('managed-immediate')}
            data-testid="managed-immediate"
            mode="immediate"
            prefetch={false}
            navigationPolicy={recordingPolicy('managed-immediate')}
            onFastNavigate={recordingObserver('managed-immediate')}
            onClick={recordingClick('managed-immediate')}
          >
            Immediate link inside release region
          </FastLink>
        </nav>
      </FastLinkRegion>
      <FastLinkRegion
        basePath="/docs"
        mode="native"
        navigationPolicy={recordingPolicy('outer-native')}
        onFastNavigate={recordingObserver('outer-native')}
      >
        <nav>
          <Link
            href={destination('outer-native')}
            data-testid="outer-native"
            prefetch={false}
          >
            Native region
          </Link>
          <FastLinkRegion
            basePath="/docs"
            navigationPolicy={recordingPolicy('inner-release')}
            onFastNavigate={recordingObserver('inner-release')}
          >
            <Link
              href={destination('inner-release')}
              data-testid="inner-release"
              prefetch={false}
            >
              Release region inside native region
            </Link>
          </FastLinkRegion>
        </nav>
      </FastLinkRegion>
      <FastLinkRegion
        basePath="/docs"
        mode="immediate"
        navigationPolicy={recordingPolicy('outer-immediate')}
        onFastNavigate={recordingObserver('outer-immediate')}
      >
        <nav>
          <FastLink
            href={destination('managed-native')}
            data-testid="managed-native"
            mode="native"
            prefetch={false}
            navigationPolicy={recordingPolicy('managed-native')}
            onFastNavigate={recordingObserver('managed-native')}
          >
            Native link inside immediate region
          </FastLink>
        </nav>
      </FastLinkRegion>
    </section>
  );
}

// Test controls change mode and href while the pointer is held.
function ModeChangingLink({
  id,
  initialMode,
  guard = 'none',
}: {
  id: string;
  initialMode: LinkMode;
  guard?: Guard;
}): JSX.Element {
  const [mode, setMode] = useState(initialMode);
  const [href, setHref] = useState(destination(id));
  useEffect(
    () =>
      registerHandle(id, {
        setMode: (next: LinkMode) => flushSync(() => setMode(next)),
        setHref: (next: string) => flushSync(() => setHref(next)),
      }),
    [id],
  );
  return (
    <FastLink
      href={href}
      mode={mode}
      prefetch={false}
      data-testid={id}
      data-mode={mode}
      navigationPolicy={recordingPolicy(id)}
      onFastNavigate={recordingObserver(id)}
      onClick={recordingClick(id)}
      onNavigate={(event) => {
        record(`${id}:guard`);
        if (guard === 'cancel') event.preventDefault();
        if (guard === 'throw') throw new Error(`${id}: guard failure`);
        if (guard === 'to-native') flushSync(() => setMode('native'));
      }}
    >
      {id}
    </FastLink>
  );
}

function ModeChangingHook({ id }: { id: string }): JSX.Element {
  const [mode, setMode] = useState<LinkMode>('release');
  const href = destination(id);
  const binding = useFastLink({
    href,
    mode,
    navigationPolicy: recordingPolicy(id),
    onFastNavigate: recordingObserver(id),
    onClickCapture: () => {
      record(`${id}:capture`);
      flushSync(() => setMode('native'));
    },
    onNavigate: () => record(`${id}:hook-guard`),
  });
  return (
    <Link
      href={href}
      prefetch={false}
      onNavigate={() => record(`${id}:link-guard`)}
      {...binding}
      data-testid={id}
      data-mode={mode}
    >
      {id}
    </Link>
  );
}

// Enabling prefetch during the guard reattaches Next Link's ref before navigation.
function PrefetchEnablingLink({
  id,
  kind,
  mode,
}: {
  id: string;
  kind: 'router' | 'document';
  mode?: LinkMode;
}): JSX.Element {
  const [prefetch, setPrefetch] = useState(false);
  return (
    <FastLink
      href={destination(id)}
      mode={mode}
      prefetch={prefetch}
      data-testid={id}
      navigationPolicy={recordingPolicy(id, kind)}
      onFastNavigate={recordingObserver(id)}
      onNavigate={() => {
        record(`${id}:guard`);
        flushSync(() => setPrefetch(true));
      }}
    >
      {id}
    </FastLink>
  );
}

// Control without Fast Link: the guard enables prefetch, then assigns the document.
function PrefetchEnablingNextLink({ id }: { id: string }): JSX.Element {
  const [prefetch, setPrefetch] = useState(false);
  const href = destination(id);
  return (
    <Link
      href={href}
      prefetch={prefetch}
      data-testid={id}
      onNavigate={(event) => {
        record(`${id}:guard`);
        flushSync(() => setPrefetch(true));
        event.preventDefault();
        location.assign(`/docs${href}`);
      }}
    >
      {id}
    </Link>
  );
}
