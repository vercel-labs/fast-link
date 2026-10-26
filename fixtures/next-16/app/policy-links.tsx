'use client';

import {
  FastLinkRegion,
  useFastLink,
  type FastNavigationPolicy,
  type UseFastLinkOptions,
} from '@fast-link/next';
import Link from 'next/link';
import {
  forwardRef,
  useEffect,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type JSX,
} from 'react';

// The application classifies router ownership using the URL's `owner` parameter.
const navigationPolicy: FastNavigationPolicy = (intent, proposed) => {
  if (intent.url.searchParams.get('owner') !== 'owned') {
    return {
      kind: 'document',
      method: proposed.method === 'replace' ? 'replace' : 'assign',
    };
  }
  return intent.url.searchParams.has('keep-scroll')
    ? { kind: 'router', scroll: false }
    : { kind: 'router' };
};

type AppLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, 'href'> &
  Pick<UseFastLinkOptions, 'href' | 'enabled'>;

const AppLink = forwardRef<HTMLAnchorElement | HTMLSpanElement, AppLinkProps>(
  function AppLink({ href, enabled, children, ...props }, forwardedRef) {
    const [pending, setPending] = useState(false);
    const attach = useFastLink({
      href,
      ...props,
      enabled,
      forwardedRef,
      navigationPolicy,
      onFastNavigate: (_, decision) => {
        sessionStorage.setItem(
          'policy-actions',
          String(Number(sessionStorage.getItem('policy-actions') ?? 0) + 1),
        );
        if (decision.kind === 'router') setPending(true);
      },
    });
    return href ? (
      <Link {...props} href={href} {...attach} data-pending={pending}>
        {children}
      </Link>
    ) : (
      <span {...attach}>{children}</span>
    );
  },
);

function AppRegion({ children }: { children: ReactNode }) {
  return (
    <FastLinkRegion
      basePath="/docs"
      navigationPolicy={navigationPolicy}
      onFastNavigate={() =>
        sessionStorage.setItem(
          'policy-actions',
          String(Number(sessionStorage.getItem('policy-actions') ?? 0) + 1),
        )
      }
    >
      {children}
    </FastLinkRegion>
  );
}

export function PolicyLinks(): JSX.Element {
  const [events, setEvents] = useState<string[]>([]);
  const [showPrefetch, setShowPrefetch] = useState(false);
  useEffect(() => {
    const capture = () => setEvents((value) => [...value, 'capture']);
    const bubble = (event: MouseEvent) =>
      setEvents((value) => [
        ...value,
        event.defaultPrevented ? 'bubble:prevented' : 'bubble:allowed',
      ]);
    document.addEventListener('click', capture, true);
    document.addEventListener('click', bubble);
    return () => {
      document.removeEventListener('click', capture, true);
      document.removeEventListener('click', bubble);
    };
  }, []);
  return (
    <section>
      <AppRegion>
        <nav aria-label="Policy navigation">
          <Link
            href="/fast?owner=owned"
            prefetch={false}
            data-testid="policy-region-owned"
          >
            Owned ordinary link
          </Link>
          <Link
            href="/fast?owner=foreign"
            prefetch={false}
            data-testid="policy-region-foreign"
          >
            Foreign ordinary link
          </Link>
          <Link
            href="/fast"
            prefetch={false}
            data-testid="policy-region-unknown"
          >
            Unknown ordinary link
          </Link>
          <AppLink
            href="/fast?owner=owned"
            prefetch={false}
            data-testid="policy-owned"
          >
            Owned
          </AppLink>
          <AppLink
            href="/fast?owner=foreign"
            prefetch={false}
            data-testid="policy-foreign"
          >
            Foreign
          </AppLink>
          <AppLink href="/fast" prefetch={false} data-testid="policy-unknown">
            Unknown
          </AppLink>
          <AppLink
            href="/fast?owner=foreign"
            replace
            prefetch={false}
            data-testid="policy-document-replace"
          >
            Document replace
          </AppLink>
          <AppLink
            href="/fast?owner=owned"
            replace
            prefetch={false}
            data-testid="policy-router-replace"
          >
            Router replace
          </AppLink>
          <AppLink
            href="/fast?owner=owned"
            enabled={false}
            prefetch={false}
            data-testid="policy-disabled"
          >
            Disabled
          </AppLink>
          <AppLink
            href="/fast?owner=owned"
            data-no-fast-link
            prefetch={false}
            data-testid="policy-optout"
          >
            Opt out
          </AppLink>
          <AppLink
            href="/slow?owner=owned"
            prefetch={false}
            data-testid="policy-pending"
            ref={(element) => {
              if (element) element.dataset.attached = 'true';
            }}
            onClick={(event) =>
              setEvents((value) => [
                ...value,
                event.defaultPrevented ? 'click:prevented' : 'click:allowed',
              ])
            }
          >
            Pending
          </AppLink>
          <AppLink>Optional href</AppLink>
          <button
            onClick={() => setShowPrefetch(true)}
            data-testid="show-prefetch"
          >
            Show prefetch links
          </button>
          {showPrefetch && (
            <>
              <AppLink
                href="/prefetch-enabled"
                prefetch={true}
                data-testid="prefetch-enabled"
              >
                Enabled prefetch
              </AppLink>
              <AppLink
                href="/prefetch-disabled"
                prefetch={false}
                data-testid="prefetch-disabled"
              >
                Disabled prefetch
              </AppLink>
            </>
          )}
          <div style={{ height: 800 }} />
          <AppLink
            href="/fast?owner=owned&keep-scroll"
            prefetch={false}
            data-testid="policy-keep-scroll"
          >
            Keep scroll
          </AppLink>
          <AppLink
            href="/fast?owner=owned"
            prefetch={false}
            data-testid="policy-default-scroll"
          >
            Default scroll
          </AppLink>
          <Link
            href="/fast?owner=owned&keep-scroll"
            prefetch={false}
            data-testid="policy-region-keep-scroll"
          >
            Region keep scroll
          </Link>
          <div style={{ height: 800 }} />
        </nav>
      </AppRegion>
      <output data-testid="policy-events">{events.join(',')}</output>
    </section>
  );
}
