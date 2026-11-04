import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { flushSync } from 'react-dom';

import { HookLink, pointerDown, router } from '../testing';
import { useFastLink } from './index';

it('prepares on press and commits at click capture after the caller guard', () => {
  const events: string[] = [];
  const push = vi.fn(() => events.push('commit'));
  router.experimental_prepare = vi.fn(() => ({ push, replace: vi.fn() }));
  const { getByRole } = render(
    <HookLink href="/guide" onClickCapture={() => events.push('guard')} />,
  );
  const anchor = getByRole('link');
  pointerDown(anchor);
  expect(router.experimental_prepare).toHaveBeenCalledExactlyOnceWith('/guide');
  expect(router.push).not.toHaveBeenCalled();
  expect(events).toEqual([]);
  fireEvent.click(anchor, { detail: 1 });
  expect(events).toEqual(['guard', 'commit']);
  expect(router.push).not.toHaveBeenCalled();
});

it.each(['onClickCapture', 'onNavigate'] as const)(
  'allows %s to cancel before policy and navigation',
  (guard) => {
    const push = vi.fn();
    router.experimental_prepare = vi.fn(() => ({ push, replace: vi.fn() }));
    const policy = vi.fn(() => ({ kind: 'router' as const }));
    const { getByRole } = render(
      <HookLink
        href="/guide"
        navigationPolicy={policy}
        {...{
          [guard]: (event: { preventDefault(): void }) =>
            event.preventDefault(),
        }}
      />,
    );
    const anchor = getByRole('link');
    pointerDown(anchor);
    fireEvent.click(anchor, { detail: 1 });
    expect(policy).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  },
);

it('reads policy and commit options after a capture guard synchronously commits new props', () => {
  const replace = vi.fn();
  router.experimental_prepare = vi.fn(() => ({ push: vi.fn(), replace }));
  const nextPolicy = vi.fn(() => ({ kind: 'router' as const, scroll: false }));
  function Renderer() {
    const [changed, setChanged] = useState(false);
    const binding = useFastLink({
      href: '/guide',
      replace: changed,
      navigationPolicy: changed ? nextPolicy : () => ({ kind: 'router' }),
      onClickCapture: () => flushSync(() => setChanged(true)),
    });
    return (
      <a href="/guide" {...binding}>
        Guide
      </a>
    );
  }
  const { getByRole } = render(<Renderer />);
  const anchor = getByRole('link');
  pointerDown(anchor);
  fireEvent.click(anchor, { detail: 1 });
  expect(nextPolicy).toHaveBeenCalledTimes(1);
  expect(replace).toHaveBeenCalledExactlyOnceWith({
    scroll: false,
    transitionTypes: undefined,
  });
  expect(router.replace).not.toHaveBeenCalled();
});

it('publishes the capture guard before a replacement ref dispatches a click', () => {
  const observed: string[] = [];
  const firstRef = vi.fn();
  const secondRef = (anchor: HTMLAnchorElement | null) => {
    anchor?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }),
    );
  };
  const { getByRole, rerender } = render(
    <HookLink
      href="/guide"
      forwardedRef={firstRef}
      onClickCapture={() => observed.push('first')}
    />,
  );
  pointerDown(getByRole('link'));
  rerender(
    <HookLink
      href="/guide"
      forwardedRef={secondRef}
      onClickCapture={() => observed.push('second')}
    />,
  );
  expect(observed).toEqual(['second']);
  expect(router.push).toHaveBeenCalledTimes(1);
});
