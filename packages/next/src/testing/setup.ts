import type { AnchorHTMLAttributes } from 'react';
import type { Mock } from 'vitest';

type Router = { push: Mock; replace: Mock };

/** Switchable App Router mock, reset before each test. */
const routing: { defaultRouter: Router; current: Router } = vi.hoisted(() => {
  const defaultRouter = { push: vi.fn(), replace: vi.fn() };
  return { defaultRouter, current: defaultRouter };
});

/** Default router spies for navigation assertions. */
const router: Router = routing.defaultRouter;

vi.mock('next/navigation', () => ({ useRouter: () => routing.current }));

vi.mock('next/link', async () => {
  const { createElement, forwardRef } =
    await vi.importActual<typeof import('react')>('react');
  return {
    default: forwardRef<
      HTMLAnchorElement,
      Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
        href:
          | string
          | {
              pathname?: string;
              query?: Record<string, string>;
              hash?: string;
              protocol?: string;
              host?: string;
            };
        as?: string;
        replace?: boolean;
        scroll?: boolean;
        prefetch?: boolean | null;
        onNavigate?: (event: { preventDefault(): void }) => void;
        legacyBehavior?: boolean;
        transitionTypes?: string[];
      }
    >(function TestLink(
      {
        href,
        as,
        replace: _replace,
        scroll: _scroll,
        prefetch: _prefetch,
        onNavigate,
        legacyBehavior: _legacyBehavior,
        transitionTypes: _transitionTypes,
        onClick,
        ...props
      },
      ref,
    ) {
      const destination =
        as ??
        (typeof href === 'string'
          ? href
          : `${href.protocol ?? ''}${href.host ?? ''}${href.pathname ?? ''}${href.query ? `?${new URLSearchParams(href.query)}` : ''}${href.hash ? `#${href.hash.replace(/^#/, '')}` : ''}`);
      const renderedHref = destination.startsWith('/')
        ? `/docs${destination}`
        : destination;

      return createElement('a', {
        ...props,
        href: renderedHref,
        ref,
        onClick(event) {
          onClick?.(event);
          if (!event.defaultPrevented)
            onNavigate?.({ preventDefault: () => event.preventDefault() });
        },
      });
    }),
  };
});

beforeEach(() => {
  routing.current = router;
  router.push.mockClear();
  router.replace.mockClear();
});

export { router, routing };
