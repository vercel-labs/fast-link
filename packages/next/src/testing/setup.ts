import type Link from 'next/link';
import type { AnchorHTMLAttributes, ComponentPropsWithoutRef } from 'react';
import type { Mock } from 'vitest';

type LinkProps = ComponentPropsWithoutRef<typeof Link>;
type TestLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> &
  Pick<
    LinkProps,
    | 'href'
    | 'as'
    | 'replace'
    | 'scroll'
    | 'prefetch'
    | 'onNavigate'
    | 'legacyBehavior'
    | 'transitionTypes'
  >;

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
    default: forwardRef<HTMLAnchorElement, TestLinkProps>(function TestLink(
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
      const destination = toMockHref(as ?? href);
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

function toMockHref(href: LinkProps['href']): string {
  if (typeof href === 'string') return href;
  const query = href.query
    ? `?${new URLSearchParams(href.query as Record<string, string>)}`
    : '';
  const hash = href.hash ? `#${href.hash.replace(/^#/, '')}` : '';
  return `${href.protocol ?? ''}${href.host ?? ''}${href.pathname ?? ''}${query}${hash}`;
}

beforeEach(() => {
  routing.current = router;
  router.push.mockClear();
  router.replace.mockClear();
});

export { router, routing };
