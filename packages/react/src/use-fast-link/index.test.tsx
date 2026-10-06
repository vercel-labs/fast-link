import type { FastLinkIntent } from '@fast-link/core';
import { fireEvent, render } from '@testing-library/react';
import { StrictMode, type JSX } from 'react';
import { renderToString } from 'react-dom/server';

import { useFastLink } from './index';

function pointerDown(element: Element): void {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  element.dispatchEvent(event);
}

it('binds a containing element and suppresses its follow-up click', () => {
  const navigations: string[] = [];
  const clicks: string[] = [];

  function Region(): JSX.Element {
    const attach = useFastLink<HTMLDivElement>({
      navigate: ({ href }: FastLinkIntent) => navigations.push(href),
    });
    return (
      <div ref={attach} onClick={() => clicks.push('region')}>
        <a href="/first" onClick={() => clicks.push('link')}>
          First
        </a>
      </div>
    );
  }

  const { getByRole } = render(<Region />);
  const anchor = getByRole('link');
  pointerDown(anchor);
  const allowed = fireEvent.click(anchor, { detail: 1 });

  expect(navigations).toEqual(['/first']);
  expect(allowed).toBe(false);
  expect(clicks).toEqual(['link', 'region']);
});

it('uses committed options and keeps a pending click across rerenders', () => {
  const first: string[] = [];
  const second: string[] = [];
  function Region({
    enabled,
    navigate,
  }: {
    enabled: boolean;
    navigate: (intent: FastLinkIntent) => void;
  }): JSX.Element {
    const attach = useFastLink<HTMLDivElement>({ enabled, navigate });
    return (
      <div ref={attach}>
        <a href="/first">First</a>
      </div>
    );
  }

  const { getByRole, rerender } = render(
    <Region enabled navigate={({ href }) => first.push(href)} />,
  );
  const anchor = getByRole('link');
  pointerDown(anchor);
  rerender(<Region enabled navigate={({ href }) => second.push(href)} />);
  const allowed = fireEvent.click(anchor, { detail: 1 });
  pointerDown(anchor);
  rerender(
    <Region enabled={false} navigate={({ href }) => second.push(href)} />,
  );
  pointerDown(anchor);

  expect(first).toEqual(['/first']);
  expect(second).toEqual(['/first']);
  expect(allowed).toBe(false);
});

it('updates caller refs without replacing the controller', () => {
  const events: string[] = [];
  const firstRef = (element: HTMLDivElement | null) => {
    if (element) {
      events.push('first attach');
      return () => events.push('first cleanup');
    }
    events.push('first null');
  };
  const secondRef = (element: HTMLDivElement | null) => {
    if (element) {
      events.push('second attach');
      return () => events.push('second cleanup');
    }
    events.push('second null');
  };
  const navigate = vi.fn();

  function Region({ callerRef }: { callerRef: typeof firstRef }): JSX.Element {
    const attach = useFastLink<HTMLDivElement>({
      navigate,
      forwardedRef: callerRef,
    });
    return (
      <div ref={attach}>
        <a href="/first">First</a>
      </div>
    );
  }

  const { getByRole, rerender, unmount } = render(
    <Region callerRef={firstRef} />,
  );
  const anchor = getByRole('link');
  pointerDown(anchor);
  rerender(<Region callerRef={secondRef} />);
  const allowed = fireEvent.click(anchor, { detail: 1 });
  unmount();

  expect(allowed).toBe(false);
  expect(events).toEqual([
    'first attach',
    'first cleanup',
    'second attach',
    'second cleanup',
  ]);
  expect(navigate).toHaveBeenCalledTimes(1);
});

it('replaces and removes its root, including in Strict Mode', () => {
  const navigate = vi.fn();
  function Region({ section }: { section: boolean }): JSX.Element {
    const attach = useFastLink<HTMLElement>({ navigate });
    return section ? (
      <section ref={attach}>
        <a href="/second">Second</a>
      </section>
    ) : (
      <div ref={attach}>
        <a href="/first">First</a>
      </div>
    );
  }

  const { getByRole, rerender, unmount } = render(
    <StrictMode>
      <Region section={false} />
    </StrictMode>,
  );
  const oldAnchor = getByRole('link');
  pointerDown(oldAnchor);
  rerender(
    <StrictMode>
      <Region section />
    </StrictMode>,
  );
  const newAnchor = getByRole('link');
  pointerDown(oldAnchor);
  pointerDown(newAnchor);
  unmount();
  pointerDown(newAnchor);

  expect(navigate.mock.calls.map(([intent]) => intent.href)).toEqual([
    '/first',
    '/second',
  ]);
});

it('renders on the server without attaching a controller', () => {
  function Region(): JSX.Element {
    const attach = useFastLink<HTMLDivElement>({
      navigate: () => {
        throw new Error('server rendering must not navigate');
      },
    });
    return (
      <div ref={attach}>
        <a href="/first">First</a>
      </div>
    );
  }

  expect(renderToString(<Region />)).toContain('href="/first"');
});

it('lets an application adapter choose its own navigation policy', () => {
  const clientRoutes: string[] = [];
  const documentRoutes: string[] = [];
  const clicks: string[] = [];

  function AppRegion({ enabled = true }: { enabled?: boolean }): JSX.Element {
    const attach = useFastLink<HTMLDivElement>({
      enabled,
      navigate: ({ anchor, href, url }) => {
        if (anchor.dataset.application === 'current' && href.startsWith('/')) {
          clientRoutes.push(url.pathname + url.search);
          return;
        }
        documentRoutes.push(url.href);
      },
    });
    return (
      <div ref={attach} onClick={() => clicks.push('region')}>
        <a
          data-application="current"
          href="/inside"
          onClick={() => clicks.push('link')}
        >
          Inside
        </a>
        <a data-application="other" href="/outside">
          Outside
        </a>
      </div>
    );
  }

  const { getByText, rerender, unmount } = render(<AppRegion />);
  const inside = getByText('Inside');
  const outside = getByText('Outside');
  pointerDown(inside);
  expect(fireEvent.click(inside, { detail: 1 })).toBe(false);
  pointerDown(outside);
  expect(fireEvent.click(outside, { detail: 1 })).toBe(false);
  rerender(<AppRegion enabled={false} />);
  pointerDown(inside);
  unmount();
  pointerDown(outside);

  expect(clientRoutes).toEqual(['/inside']);
  expect(documentRoutes).toEqual(['https://example.com/outside']);
  expect(clicks).toEqual(['link', 'region', 'region']);
});
