/*
 * Tests the React hook's bindings, committed options, refs, and cleanup through
 * rendered components. Rerenders, Strict Mode, and portals exercise controller
 * lifetime and pending-click suppression.
 */

import type { FastLinkIntent } from '@fast-link/core';
import { fireEvent, render } from '@testing-library/react';
import { StrictMode, type JSX, type MouseEventHandler } from 'react';
import { createPortal } from 'react-dom';

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
      <div {...attach} onClick={() => clicks.push('region')}>
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
      <div {...attach}>
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
  expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);
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
      <div {...attach}>
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
      <section {...attach}>
        <a href="/second">Second</a>
      </section>
    ) : (
      <div {...attach}>
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

it('keeps bindings stable and composes the committed caller capture handler after suppression', () => {
  const observed: string[] = [];
  const navigate = vi.fn();
  const bindings: ReturnType<typeof useFastLink<HTMLDivElement>>[] = [];
  function Region({ handler }: { handler: MouseEventHandler<HTMLDivElement> }) {
    const binding = useFastLink<HTMLDivElement>({
      navigate,
      onClickCapture: handler,
    });
    bindings.push(binding);
    return (
      <div {...binding}>
        <a href="/first">First</a>
      </div>
    );
  }
  const { getByRole, rerender } = render(
    <Region
      handler={(event) => observed.push(`first:${event.defaultPrevented}`)}
    />,
  );
  const anchor = getByRole('link');
  pointerDown(anchor);
  rerender(
    <Region
      handler={(event) => observed.push(`second:${event.defaultPrevented}`)}
    />,
  );
  expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);
  expect(observed).toEqual(['second:true']);
  expect(bindings[1]).toBe(bindings[0]);
  expect(navigate).toHaveBeenCalledTimes(1);
});

it('leaves an out-of-root portal click native without consuming a pending click', () => {
  const portal = document.body.appendChild(document.createElement('div'));
  const observed: string[] = [];
  function Region() {
    const binding = useFastLink<HTMLDivElement>({ navigate: () => undefined });
    return (
      <div {...binding}>
        <a
          href="/first"
          onClickCapture={(event) =>
            observed.push(`inside:${event.defaultPrevented}`)
          }
        >
          Inside
        </a>
        {createPortal(
          <a
            href="/outside"
            onClickCapture={(event) => {
              observed.push(`outside:${event.defaultPrevented}`);
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            Outside
          </a>,
          portal,
        )}
      </div>
    );
  }
  const { getByText, unmount } = render(<Region />);
  try {
    pointerDown(getByText('Inside'));
    fireEvent.click(getByText('Outside'), { detail: 1 });
    fireEvent.click(getByText('Inside'), { detail: 1 });
    expect(observed).toEqual(['outside:false', 'inside:true']);
  } finally {
    unmount();
    portal.remove();
  }
});

it('forwards a managed follow-up past stale region state before stopping descendant capture', () => {
  const routes: string[] = [];
  const observed: boolean[] = [];
  function Managed() {
    const binding = useFastLink<HTMLAnchorElement>({
      navigate: ({ href }) => routes.push(href),
    });
    return (
      <div
        onClickCapture={(event) => {
          observed.push(event.defaultPrevented);
          event.stopPropagation();
        }}
      >
        <a {...binding} href="/managed">
          Managed
        </a>
      </div>
    );
  }
  function Region() {
    const binding = useFastLink<HTMLDivElement>({
      navigate: ({ href }) => routes.push(href),
    });
    return (
      <div {...binding}>
        <a href="/ordinary">Ordinary</a>
        <Managed />
      </div>
    );
  }
  const { getByText } = render(<Region />);
  const ordinary = getByText('Ordinary');
  const descendant = getByText('Managed');
  const wrapper = descendant.parentElement;
  const root = wrapper?.parentElement;
  if (!wrapper || !root) throw new Error('Missing managed wrapper or region');
  pointerDown(ordinary);
  // Press outside the region, then restore the managed anchor without remounting.
  document.body.append(wrapper);
  pointerDown(descendant);
  root.append(wrapper);

  expect(fireEvent.click(descendant, { detail: 1 })).toBe(false);
  expect(observed).toEqual([true]);
  expect(routes).toEqual(['/ordinary', '/managed']);
  expect(fireEvent.click(ordinary, { detail: 1 })).toBe(false);
});
