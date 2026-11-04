import { fireEvent, render } from '@testing-library/react';
import { StrictMode, useCallback, useState } from 'react';
import { flushSync } from 'react-dom';

import { useClickPreparation } from './index';

it('preserves preparation across committed updates and cleans up replaced roots and refs', () => {
  const prepare = vi.fn(() => 'request');
  const accepted = vi.fn();
  const cleanup = vi.fn();
  const forwardedRef = vi.fn(() => cleanup);
  function Link({
    label,
    section = false,
  }: {
    label: string;
    section?: boolean;
  }) {
    const binding = useClickPreparation({ prepare, forwardedRef });
    const props = {
      ref: binding.ref,
      onClick: (event: React.MouseEvent) => {
        const activation = binding.matchClick(event.nativeEvent);
        event.preventDefault();
        const result = activation?.consume();
        if (result) accepted(result.prepared);
      },
    };
    return section ? (
      <section {...props}>
        <a href="/guide">{label}</a>
      </section>
    ) : (
      <div {...props}>
        <a href="/guide">{label}</a>
      </div>
    );
  }
  const { getByRole, rerender, unmount } = render(
    <StrictMode>
      <Link label="First" />
    </StrictMode>,
  );
  const press = (anchor: HTMLElement) => {
    const event = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    anchor.dispatchEvent(event);
  };
  press(getByRole('link'));
  rerender(
    <StrictMode>
      <Link label="Updated" />
    </StrictMode>,
  );
  fireEvent.click(getByRole('link'), { detail: 1 });
  expect(accepted).toHaveBeenCalledExactlyOnceWith('request');
  const oldAnchor = getByRole('link');
  press(oldAnchor);
  rerender(
    <StrictMode>
      <Link label="Replaced" section />
    </StrictMode>,
  );
  fireEvent.click(getByRole('link'), { detail: 1 });
  expect(accepted).toHaveBeenCalledTimes(1);
  const newAnchor = getByRole('link');
  press(oldAnchor);
  expect(prepare).toHaveBeenCalledTimes(2);
  press(newAnchor);
  expect(prepare).toHaveBeenCalledTimes(3);
  unmount();
  press(newAnchor);
  expect(prepare).toHaveBeenCalledTimes(3);
  expect(cleanup).toHaveBeenCalledTimes(forwardedRef.mock.calls.length);
});

it('updates options before replacement caller refs run without replacing the binding', () => {
  const observed: string[] = [];
  const bindings: unknown[] = [];
  const firstRef = vi.fn();
  const secondRef = (root: HTMLDivElement | null) => {
    const anchor = root?.querySelector('a');
    if (!anchor) return;
    const event = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    anchor.dispatchEvent(event);
  };
  function Region({
    label,
    callerRef,
  }: {
    label: string;
    callerRef: typeof secondRef;
  }) {
    const binding = useClickPreparation({
      prepare: () => {
        observed.push(label);
        return label;
      },
      forwardedRef: callerRef,
    });
    bindings.push(binding);
    return (
      <div ref={binding.ref}>
        <a href="/guide">Guide</a>
      </div>
    );
  }
  const { rerender, unmount } = render(
    <Region label="first" callerRef={firstRef} />,
  );
  rerender(<Region label="second" callerRef={secondRef} />);
  expect(observed).toEqual(['second']);
  expect(bindings[0]).toBe(bindings[1]);
  unmount();
  expect(
    firstRef.mock.calls.map(([element]) => element?.tagName ?? null),
  ).toEqual(['DIV', null]);
});

it('preserves the gesture when a renderer reattaches its ref to the same anchor', () => {
  const accepted = vi.fn();
  function Renderer({ href }: { href: string }) {
    const binding = useClickPreparation({ prepare: () => 'prepared' });
    const ref = useCallback(
      (element: HTMLAnchorElement | null) => binding.ref(element),
      [binding.ref, href],
    );
    return (
      <a
        href={href}
        ref={ref}
        onClick={(event) => {
          const candidate = binding.matchClick(event.nativeEvent);
          event.preventDefault();
          const activation = candidate?.consume();
          if (activation) accepted(activation.intent.href, activation.prepared);
        }}
      >
        Guide
      </a>
    );
  }
  const { getByRole, rerender } = render(<Renderer href="/first" />);
  const anchor = getByRole('link');
  const press = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
  Object.defineProperty(press, 'pointerType', { value: 'mouse' });
  anchor.dispatchEvent(press);
  rerender(<Renderer href="/second" />);
  expect(getByRole('link')).toBe(anchor);
  fireEvent.click(anchor, { detail: 1 });
  expect(accepted).toHaveBeenCalledExactlyOnceWith('/second', null);
});

it.each(['before-match', 'after-match'] as const)(
  'rejects activation when a guard removes only the root %s and cleans up its listeners',
  async (timing) => {
    const prepare = vi.fn(() => 'prepared');
    const accepted = vi.fn();
    function Link() {
      const [visible, setVisible] = useState(true);
      const binding = useClickPreparation({ prepare });
      return visible ? (
        <a
          href="/guide"
          ref={binding.ref}
          onClick={(event) => {
            const candidate =
              timing === 'after-match'
                ? binding.matchClick(event.nativeEvent)
                : null;
            flushSync(() => setVisible(false));
            const activation = (
              candidate ?? binding.matchClick(event.nativeEvent)
            )?.consume();
            if (activation) accepted(activation);
            event.preventDefault();
          }}
        >
          Guide
        </a>
      ) : null;
    }
    const { getByRole } = render(<Link />);
    const anchor = getByRole('link');
    const press = () => {
      const event = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
      Object.defineProperty(event, 'pointerType', { value: 'mouse' });
      anchor.dispatchEvent(event);
    };
    press();
    fireEvent.click(anchor, { detail: 1 });
    expect(anchor.isConnected).toBe(false);
    expect(accepted).not.toHaveBeenCalled();
    await Promise.resolve();
    press();
    expect(prepare).toHaveBeenCalledTimes(1);
  },
);
