/*
 * Tests region navigation for existing links with mocked Next Link and App
 * Router, including base paths, opt-outs, and click propagation. Nested regions
 * and managed links must share ownership without duplicate routes.
 */

import { createLinkInteraction, type LinkMode } from '@fast-link/core';
import { fireEvent, render } from '@testing-library/react';
import Link from 'next/link';
import { StrictMode, useLayoutEffect, useRef, type ReactNode } from 'react';

import { FastLink } from '../fast-link';
import { pointerDown, router, routing } from '../testing';
import { FastLinkRegion } from './index';

it('leaves a managed click to a stopping ancestor guard', () => {
  const observed: boolean[] = [];
  const { getByRole } = render(
    <FastLinkRegion>
      <div
        onClickCapture={(event) => {
          observed.push(event.defaultPrevented);
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <FastLink href="/pricing">Pricing</FastLink>
      </div>
    </FastLinkRegion>,
  );
  const anchor = getByRole('link');
  pointerDown(anchor);
  const allowed = fireEvent.click(anchor, { detail: 1 });

  expect(observed).toEqual([false]);
  expect(allowed).toBe(false);
  expect(router.push).not.toHaveBeenCalled();
});

describe('FastLinkRegion', () => {
  it('prepares an ordinary Next Link and routes at click capture with one base path', () => {
    const push = vi.fn();
    router.experimental_prepare = vi.fn(() => ({ push, replace: vi.fn() }));
    const { getByRole } = render(
      <FastLinkRegion basePath="/docs">
        <nav>
          <Link href="/pricing?from=region">Pricing</Link>
        </nav>
      </FastLinkRegion>,
    );
    const anchor = getByRole('link');
    expect(anchor.getAttribute('href')).toBe('/docs/pricing?from=region');

    pointerDown(anchor);

    expect(router.experimental_prepare).toHaveBeenCalledExactlyOnceWith(
      '/pricing?from=region',
    );
    expect(push).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    fireEvent.click(anchor, { detail: 1 });
    expect(push).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps the follow-up click in the link and ancestor handlers', () => {
    const events: string[] = [];
    const { getByRole } = render(
      <div onClick={() => events.push('parent')}>
        <FastLinkRegion onFastNavigate={() => events.push('fast')}>
          <nav onClick={() => events.push('nav')}>
            <Link href="/pricing" onClick={() => events.push('link')}>
              Pricing
            </Link>
          </nav>
        </FastLinkRegion>
      </div>,
    );
    const anchor = getByRole('link');

    pointerDown(anchor);
    const allowed = fireEvent.click(anchor, { detail: 1 });

    expect(allowed).toBe(false);
    expect(events).toEqual(['fast', 'link', 'nav', 'parent']);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('routes plain anchors inside the base path and leaves opt-outs native', () => {
    const { getByText } = render(
      <FastLinkRegion basePath="/docs">
        <a href="/docs">Root</a>
        <a href="/docs/pricing">Pricing</a>
        <a href="/docs-extra">Lookalike prefix</a>
        <a href="/docs/optout" data-no-fast-link>
          Opt out
        </a>
      </FastLinkRegion>,
    );

    pointerDown(getByText('Root'));
    fireEvent.click(getByText('Root'), { detail: 1 });
    pointerDown(getByText('Pricing'));
    fireEvent.click(getByText('Pricing'), { detail: 1 });
    pointerDown(getByText('Lookalike prefix'));
    fireEvent.click(getByText('Lookalike prefix'), { detail: 1 });
    pointerDown(getByText('Opt out'));

    expect(router.push.mock.calls.map(([destination]) => destination)).toEqual([
      '/',
      '/pricing',
      '/docs-extra',
    ]);
  });

  it('leaves disabled and opted-out links to their own handlers', () => {
    const events: string[] = [];
    const { getByText, rerender } = render(
      <FastLinkRegion mode="native">
        <Link href="/pricing">Pricing</Link>
      </FastLinkRegion>,
    );
    pointerDown(getByText('Pricing'));
    fireEvent.click(getByText('Pricing'), { detail: 1 });
    expect(router.push).not.toHaveBeenCalled();

    rerender(
      <FastLinkRegion>
        <Link
          href="/pricing"
          data-no-fast-link
          onNavigate={(event) => {
            events.push('navigate');
            event.preventDefault();
          }}
        >
          Cancel
        </Link>
        <Link
          href="/pricing"
          data-no-fast-link
          onClick={(event) => {
            events.push('click guard');
            event.preventDefault();
          }}
        >
          Guard
        </Link>
        <Link href="/pricing">Pricing</Link>
      </FastLinkRegion>,
    );
    pointerDown(getByText('Cancel'));
    expect(fireEvent.click(getByText('Cancel'), { detail: 1 })).toBe(false);
    pointerDown(getByText('Guard'));
    expect(fireEvent.click(getByText('Guard'), { detail: 1 })).toBe(false);
    pointerDown(getByText('Pricing'));
    fireEvent.click(getByText('Pricing'), { detail: 1 });

    expect(events).toEqual(['navigate', 'click guard']);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('keeps touch, pen, and modified presses native', () => {
    const clicks: string[] = [];
    const { getByRole } = render(
      <FastLinkRegion>
        <a
          href="/pricing"
          onClick={(event) => {
            clicks.push('click');
            event.preventDefault();
          }}
        >
          Pricing
        </a>
      </FastLinkRegion>,
    );
    const anchor = getByRole('link');

    pointerDown(anchor, 'touch');
    pointerDown(anchor, 'pen');
    pointerDown(anchor, 'mouse', { ctrlKey: true });
    fireEvent.click(anchor, { detail: 0 });

    expect(clicks).toEqual(['click']);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('discards the old router handle while keeping current observation and click routing', () => {
    const preparedPush = vi.fn();
    router.experimental_prepare = vi.fn(() => ({
      push: preparedPush,
      replace: vi.fn(),
    }));
    const first = vi.fn();
    const second = vi.fn();
    const { getByRole, rerender } = render(
      <FastLinkRegion onFastNavigate={first}>
        <a href="/pricing">Pricing</a>
      </FastLinkRegion>,
    );
    const anchor = getByRole('link');
    pointerDown(anchor);

    expect(router.experimental_prepare).toHaveBeenCalledExactlyOnceWith(
      '/pricing',
    );
    const nextRouter = { push: vi.fn(), replace: vi.fn() };
    routing.current = nextRouter;
    rerender(
      <FastLinkRegion onFastNavigate={second}>
        <a href="/pricing">Pricing</a>
      </FastLinkRegion>,
    );
    const allowed = fireEvent.click(anchor, { detail: 1 });
    pointerDown(anchor);

    expect(allowed).toBe(false);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(preparedPush).not.toHaveBeenCalled();
    expect(nextRouter.push).toHaveBeenCalledExactlyOnceWith('/pricing', {
      scroll: undefined,
      transitionTypes: undefined,
    });
  });

  it.each([
    ['release', 'release', 'click'],
    ['immediate', 'native', null],
    ['native', 'immediate', 'press'],
    ['immediate', 'release', 'click'],
  ] as const)(
    'uses the closest region and its policy: outer %s, inner %s',
    (outerMode, innerMode, navigatesOn) => {
      const outerPolicy = vi.fn(() => ({ kind: 'router' as const }));
      const innerPolicy = vi.fn(() => ({ kind: 'router' as const }));
      const { getByRole } = render(
        <FastLinkRegion mode={outerMode} navigationPolicy={outerPolicy}>
          <FastLinkRegion mode={innerMode} navigationPolicy={innerPolicy}>
            <a href="/pricing">Pricing</a>
          </FastLinkRegion>
        </FastLinkRegion>,
      );
      const anchor = getByRole('link');
      // Keep jsdom from following a click that the regions leave native.
      anchor.addEventListener('click', (event) => event.preventDefault());

      pointerDown(anchor);
      expect(router.push).toHaveBeenCalledTimes(
        navigatesOn === 'press' ? 1 : 0,
      );
      fireEvent.click(anchor, { detail: 1 });

      expect(router.push).toHaveBeenCalledTimes(navigatesOn ? 1 : 0);
      expect(innerPolicy).toHaveBeenCalledTimes(navigatesOn ? 1 : 0);
      expect(outerPolicy).not.toHaveBeenCalled();
    },
  );

  it('navigates an ordinary link on press in immediate mode and prevents its follow-up click', () => {
    const events: string[] = [];
    router.experimental_prepare = vi.fn();
    const { getByRole } = render(
      <FastLinkRegion
        basePath="/docs"
        mode="immediate"
        onFastNavigate={() => events.push('fast')}
      >
        <Link
          href="/pricing"
          onClick={(event) =>
            events.push(event.defaultPrevented ? 'prevented' : 'allowed')
          }
        >
          Pricing
        </Link>
      </FastLinkRegion>,
    );
    const anchor = getByRole('link');

    pointerDown(anchor);
    expect(events).toEqual(['fast']);
    expect(router.push).toHaveBeenCalledExactlyOnceWith('/pricing', {
      scroll: undefined,
      transitionTypes: undefined,
    });
    expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);

    expect(events).toEqual(['fast', 'prevented']);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.experimental_prepare).not.toHaveBeenCalled();
  });

  it('prevents an immediate managed follow-up click before a stopping ancestor guard', () => {
    const observed: boolean[] = [];
    const { getByRole } = render(
      <FastLinkRegion>
        <div
          onClickCapture={(event) => {
            observed.push(event.defaultPrevented);
            event.stopPropagation();
          }}
        >
          <FastLink href="/pricing" mode="immediate">
            Pricing
          </FastLink>
        </div>
      </FastLinkRegion>,
    );
    const anchor = getByRole('link');

    pointerDown(anchor);
    expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);

    expect(observed).toEqual([true]);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('attempts routing and surfaces a throwing observer', () => {
    const failure = new Error('observer failed');
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      const { getByRole } = render(
        <FastLinkRegion
          onFastNavigate={() => {
            throw failure;
          }}
        >
          <a href="/pricing">Pricing</a>
        </FastLinkRegion>,
      );
      pointerDown(getByRole('link'));
      fireEvent.click(getByRole('link'), { detail: 1 });
    } finally {
      window.removeEventListener('error', onError);
    }

    expect(errors).toEqual([failure]);
    expect(router.push).toHaveBeenCalledExactlyOnceWith('/pricing', {
      scroll: undefined,
      transitionTypes: undefined,
    });
  });
});

it('preserves managed ownership and cleans up composed controllers in StrictMode', () => {
  const regionPolicy = vi.fn(() => ({ kind: 'router' as const }));
  const managedPolicy = vi.fn(() => ({ kind: 'router' as const }));
  const { getByRole, unmount } = render(
    <StrictMode>
      <FastLinkRegion navigationPolicy={regionPolicy}>
        <FastLink href="/managed" navigationPolicy={managedPolicy}>
          Managed
        </FastLink>
      </FastLinkRegion>
    </StrictMode>,
  );
  const anchor = getByRole('link');
  pointerDown(anchor);
  expect(managedPolicy).not.toHaveBeenCalled();
  expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);
  expect(managedPolicy).toHaveBeenCalledTimes(1);
  expect(regionPolicy).not.toHaveBeenCalled();
  expect(router.push).toHaveBeenCalledExactlyOnceWith('/managed', {
    scroll: undefined,
    transitionTypes: undefined,
  });
  // Retain the old subtree so a live region can expose stale pending ownership.
  const subtree = anchor.parentElement;
  if (!subtree) throw new Error('Missing managed link region');
  pointerDown(anchor);
  unmount();
  pointerDown(anchor);
  const live = render(
    <FastLinkRegion>
      <span data-testid="mount" />
    </FastLinkRegion>,
  );
  live.getByTestId('mount').append(subtree);
  const click = vi.fn();
  anchor.addEventListener('click', (event) => {
    click(event.defaultPrevented);
    event.preventDefault();
  });
  fireEvent.click(anchor, { detail: 1 });
  expect(click).toHaveBeenCalledExactlyOnceWith(false);
  expect(managedPolicy).toHaveBeenCalledTimes(1);
  expect(router.push).toHaveBeenCalledTimes(1);
  expect(regionPolicy).not.toHaveBeenCalled();
  live.unmount();
});

describe('with DOM link interaction regions', () => {
  function DomRegion({
    mode,
    navigate,
    children,
  }: {
    mode: Exclude<LinkMode, 'release'>;
    navigate: () => void;
    children: ReactNode;
  }) {
    const root = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      if (!root.current) return;
      const controller = createLinkInteraction(
        root.current,
        mode === 'native' ? { mode } : { mode, navigate },
      );
      return () => controller.destroy();
    }, [mode, navigate]);
    return <div ref={root}>{children}</div>;
  }

  it.each([
    ['native', 0],
    ['immediate', 1],
  ] as const)(
    'lets a closer %s DOM region own an ordinary link inside a Next region',
    (mode, domNavigations) => {
      const policy = vi.fn(() => ({ kind: 'router' as const }));
      const navigate = vi.fn();
      const { getByRole } = render(
        <FastLinkRegion mode="immediate" navigationPolicy={policy}>
          <DomRegion mode={mode} navigate={navigate}>
            <a href="/pricing">Pricing</a>
          </DomRegion>
        </FastLinkRegion>,
      );
      const anchor = getByRole('link');
      anchor.addEventListener('click', (event) => event.preventDefault());

      pointerDown(anchor);
      fireEvent.click(anchor, { detail: 1 });

      expect(navigate).toHaveBeenCalledTimes(domNavigations);
      expect(policy).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
    },
  );

  it('lets a closer native Next region block a containing DOM region', () => {
    const navigate = vi.fn();
    const { getByRole } = render(
      <DomRegion mode="immediate" navigate={navigate}>
        <FastLinkRegion mode="native">
          <a href="/pricing">Pricing</a>
        </FastLinkRegion>
      </DomRegion>,
    );
    const anchor = getByRole('link');
    anchor.addEventListener('click', (event) => event.preventDefault());

    pointerDown(anchor);
    fireEvent.click(anchor, { detail: 1 });

    expect(navigate).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });
});
