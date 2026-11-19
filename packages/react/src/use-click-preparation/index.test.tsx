/*
 * Tests the preparation hook's committed options, refs, and controller lifetime
 * through rendered components. Core owns gesture and eligibility cases.
 */

import { fireEvent, render } from '@testing-library/react';
import * as React from 'react';
import {
  StrictMode,
  useCallback,
  useState,
  type ComponentType,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';

import { useClickPreparation } from './index';

// React 19.0, the minimum supported version, does not export Activity.
const { Activity } = React as {
  Activity?: ComponentType<{ mode: 'visible' | 'hidden'; children: ReactNode }>;
};

function press(element: Element): void {
  const event = new window.MouseEvent('pointerdown', {
    bubbles: true,
    button: 0,
  });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  element.dispatchEvent(event);
}

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
      onClick: (event: MouseEvent) => {
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
    if (anchor) press(anchor);
  };
  function Region({
    label,
    callerRef,
  }: {
    label: string;
    callerRef: (root: HTMLDivElement | null) => void;
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

it('attaches the previous caller ref to a replacement element until the commit publishes the new ref', () => {
  const observed: string[] = [];
  const firstRef = vi.fn();
  const secondRef = (root: HTMLElement | null) => {
    const anchor = root?.querySelector('a');
    if (anchor) press(anchor);
  };
  function Region({
    label,
    callerRef,
    section = false,
  }: {
    label: string;
    callerRef: (root: HTMLElement | null) => void;
    section?: boolean;
  }) {
    const binding = useClickPreparation({
      prepare: () => {
        observed.push(label);
        return label;
      },
      forwardedRef: callerRef,
    });
    const Root = section ? 'section' : 'div';
    return (
      <Root ref={binding.ref}>
        <a href="/guide">Guide</a>
      </Root>
    );
  }
  const { rerender } = render(<Region label="first" callerRef={firstRef} />);
  rerender(<Region label="second" callerRef={secondRef} section />);

  // The replacement attaches before the commit's update replaces the caller ref.
  expect(
    firstRef.mock.calls.map(([element]) => element?.tagName ?? null),
  ).toEqual(['DIV', null, 'SECTION', null]);
  expect(observed).toEqual(['second']);
});

it.skipIf(!Activity)(
  'destroys the controller while hidden by Activity and re-creates it when shown',
  () => {
    const Boundary = Activity;
    if (!Boundary) return; // Narrows the type; skipIf already skips.
    const prepare = vi.fn(() => 'prepared');
    function Link() {
      const binding = useClickPreparation({ prepare });
      return (
        <a href="/guide" ref={binding.ref}>
          Guide
        </a>
      );
    }
    const { getByRole, rerender } = render(
      <Boundary mode="visible">
        <Link />
      </Boundary>,
    );
    const anchor = getByRole('link');
    rerender(
      <Boundary mode="hidden">
        <Link />
      </Boundary>,
    );
    press(anchor);
    expect(prepare).not.toHaveBeenCalled();

    rerender(
      <Boundary mode="visible">
        <Link />
      </Boundary>,
    );
    press(anchor);
    expect(prepare).toHaveBeenCalledTimes(1);
  },
);

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
  press(anchor);
  rerender(<Renderer href="/second" />);
  expect(getByRole('link')).toBe(anchor);
  fireEvent.click(anchor, { detail: 1 });
  // The changed href keeps the gesture but drops preparation for another destination.
  expect(accepted).toHaveBeenCalledExactlyOnceWith('/second', null);
});

it('passes enabled to the controller, discarding a held gesture when disabled', () => {
  const prepare = vi.fn(() => 'prepared');
  const accepted = vi.fn();
  function Link({ enabled }: { enabled: boolean }) {
    const binding = useClickPreparation({ enabled, prepare });
    return (
      <a
        href="/guide"
        ref={binding.ref}
        onClick={(event) => {
          const activation = binding.matchClick(event.nativeEvent)?.consume();
          event.preventDefault();
          if (activation) accepted(activation.prepared);
        }}
      >
        Guide
      </a>
    );
  }
  const { getByRole, rerender } = render(<Link enabled />);
  const anchor = getByRole('link');
  press(anchor);
  rerender(<Link enabled={false} />);
  fireEvent.click(anchor, { detail: 1 });
  press(anchor);
  expect(accepted).not.toHaveBeenCalled();
  expect(prepare).toHaveBeenCalledTimes(1);

  rerender(<Link enabled />);
  press(anchor);
  fireEvent.click(anchor, { detail: 1 });
  expect(accepted).toHaveBeenCalledExactlyOnceWith('prepared');
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
    press(anchor);
    fireEvent.click(anchor, { detail: 1 });
    expect(anchor.isConnected).toBe(false);
    expect(accepted).not.toHaveBeenCalled();
    await Promise.resolve();
    press(anchor);
    expect(prepare).toHaveBeenCalledTimes(1);
  },
);
