import { fireEvent, render } from '@testing-library/react';

import { HookLink, pointerDown, router } from '../testing';
import { useFastLink } from './index';

it('leaves descendant links native when the hook ref is on a non-anchor', () => {
  const forwardedRef = { current: null as HTMLSpanElement | null };
  const policy = vi.fn(() => ({ kind: 'router' as const }));
  function Renderer() {
    const attach = useFastLink({
      href: '/proposed',
      navigationPolicy: policy,
      forwardedRef,
    });
    return (
      <span ref={attach}>
        <a href="/actual">Child</a>
      </span>
    );
  }
  const { getByRole, unmount } = render(<Renderer />);
  const anchor = getByRole('link');
  expect(forwardedRef.current?.tagName).toBe('SPAN');
  pointerDown(anchor);
  expect(policy).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
  const click = vi.fn();
  anchor.addEventListener('click', (event) => {
    click(event.defaultPrevented);
    event.preventDefault();
  });
  fireEvent.click(anchor, { detail: 1 });
  expect(click).toHaveBeenCalledExactlyOnceWith(false);
  unmount();
  expect(forwardedRef.current).toBeNull();
});

it('keeps the hook policy, pending click, and forwarded refs current across anchor/span replacement', () => {
  const first = vi.fn(() => ({ kind: 'router' as const, scroll: false }));
  const second = vi.fn(() => ({ kind: 'router' as const }));
  const ref = { current: null as HTMLAnchorElement | HTMLSpanElement | null };
  const { getByText, rerender, unmount } = render(
    <HookLink forwardedRef={ref} />,
  );
  const span = getByText('Custom');
  expect(ref.current).toBe(span);
  pointerDown(span);
  expect(router.push).not.toHaveBeenCalled();
  rerender(
    <HookLink href="/first" navigationPolicy={first} forwardedRef={ref} />,
  );
  const anchor = getByText('Custom');
  pointerDown(anchor);
  rerender(
    <HookLink href="/second" navigationPolicy={second} forwardedRef={ref} />,
  );
  expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);
  pointerDown(anchor);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).toHaveBeenCalledTimes(1);
  expect(router.push.mock.calls).toEqual([
    ['/first', { scroll: false, transitionTypes: undefined }],
    ['/second', { scroll: undefined, transitionTypes: undefined }],
  ]);
  rerender(<HookLink forwardedRef={ref} />);
  pointerDown(anchor);
  expect(router.push).toHaveBeenCalledTimes(2);
  expect(ref.current?.tagName).toBe('SPAN');
  unmount();
  expect(ref.current).toBeNull();
});
