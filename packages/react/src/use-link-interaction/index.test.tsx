/*
 * Tests the link interaction hook through rendered components: mode switches on
 * one root, committed options, ref lifetime, detached activation, and React
 * event prevention. Core owns gesture, ownership, and suppression cases.
 * Shared root lifetime cases live with useClickPreparation.
 */

import type { LinkInteractionOptions, LinkMode } from '@fast-link/core';
import { render } from '@testing-library/react';
import {
  createRef,
  StrictMode,
  useCallback,
  useState,
  type MouseEvent,
} from 'react';
import { flushSync } from 'react-dom';

import { useLinkInteraction, type LinkInteractionBinding } from './index';

function press(element: Element): void {
  const event = new window.MouseEvent('pointerdown', {
    bubbles: true,
    button: 0,
  });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  element.dispatchEvent(event);
}

/** Dispatches a pointer click and reports whether its native default was prevented. */
function click(target: Element): boolean {
  const event = new window.MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    detail: 1,
  });
  let isPrevented = false;
  // Record the result, then stop jsdom from attempting the default navigation.
  const observe = (observed: Event) => {
    isPrevented = observed.defaultPrevented;
    observed.preventDefault();
  };
  document.addEventListener('click', observe, { once: true });
  target.dispatchEvent(event);
  return isPrevented;
}

function clickEvent(target: Element): globalThis.MouseEvent {
  const event = new window.MouseEvent('click', { detail: 1, cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

/** Options for `mode` that record each callback as `<callback>:<href>`. */
function recording(
  mode: LinkMode,
  calls: string[],
): LinkInteractionOptions<string> {
  if (mode === 'release') {
    return {
      mode,
      prepare: ({ href }) => {
        calls.push(`prepare:${href}`);
        return href;
      },
    };
  }
  if (mode === 'immediate') {
    return { mode, navigate: ({ href }) => calls.push(`navigate:${href}`) };
  }
  return { mode };
}

/** A release adapter's click handler: accept a matched candidate and prevent the click. */
function acceptClick(
  binding: LinkInteractionBinding<string>,
  event: MouseEvent,
  calls: string[],
): void {
  const candidate = binding.matchClick(event.nativeEvent);
  try {
    const activation = candidate?.consume();
    if (!activation) return;
    event.preventDefault();
    calls.push(`accept:${activation.intent.href}`);
  } finally {
    candidate?.discard();
  }
}

it('switches modes on one mounted anchor without remounting it or rendering for gestures', () => {
  const calls: string[] = [];
  const objectRef = createRef<HTMLAnchorElement>();
  let renders = 0;
  function Link({ mode }: { mode: LinkMode }) {
    renders++;
    const binding = useLinkInteraction({
      ...recording(mode, calls),
      forwardedRef: objectRef,
    });
    return (
      <a
        href="/guide"
        ref={binding.ref}
        onClickCapture={binding.suppressClick}
        onClick={(event) => acceptClick(binding, event, calls)}
      >
        Guide
      </a>
    );
  }
  const { getByRole, rerender, unmount } = render(
    <StrictMode>
      <Link mode="release" />
    </StrictMode>,
  );
  const anchor = getByRole('link');
  anchor.focus();
  let committedRenders = renders;

  press(anchor);
  expect(click(anchor)).toBe(true);
  expect(calls).toEqual(['prepare:/guide', 'accept:/guide']);

  // Leaving release mode while held discards the gesture without navigating.
  press(anchor);
  expect(renders).toBe(committedRenders);
  rerender(
    <StrictMode>
      <Link mode="immediate" />
    </StrictMode>,
  );
  committedRenders = renders;
  expect(click(anchor)).toBe(false);
  expect(calls).toEqual(['prepare:/guide', 'accept:/guide', 'prepare:/guide']);

  calls.length = 0;
  press(anchor);
  expect(click(anchor)).toBe(true);
  expect(calls).toEqual(['navigate:/guide']);
  expect(renders).toBe(committedRenders);

  rerender(
    <StrictMode>
      <Link mode="native" />
    </StrictMode>,
  );
  committedRenders = renders;
  press(anchor);
  expect(click(anchor)).toBe(false);
  expect(calls).toEqual(['navigate:/guide']);

  expect(renders).toBe(committedRenders);
  expect(getByRole('link')).toBe(anchor);
  expect(document.activeElement).toBe(anchor);
  expect(objectRef.current).toBe(anchor);

  rerender(
    <StrictMode>
      <Link mode="immediate" />
    </StrictMode>,
  );
  unmount();
  press(anchor);
  expect(calls).toEqual(['navigate:/guide']);
  expect(objectRef.current).toBeNull();
});

it('publishes committed options before a changed caller ref dispatches input', () => {
  const calls: string[] = [];
  const bindings: unknown[] = [];
  const firstRef = vi.fn();
  const secondRef = (root: HTMLDivElement | null) => {
    const anchor = root?.querySelector('a');
    if (anchor) press(anchor);
  };
  function Region({
    mode,
    label,
    callerRef,
  }: {
    mode: 'release' | 'immediate';
    label: string;
    callerRef: (root: HTMLDivElement | null) => void;
  }) {
    const binding = useLinkInteraction<string, HTMLDivElement>({
      ...(mode === 'release'
        ? { mode, prepare: () => `${label}:prepare` }
        : { mode, navigate: () => calls.push(`${label}:navigate`) }),
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
    <Region mode="release" label="first" callerRef={firstRef} />,
  );
  rerender(<Region mode="immediate" label="second" callerRef={secondRef} />);

  expect(calls).toEqual(['second:navigate']);
  expect(bindings[0]).toBe(bindings[1]);
  unmount();
  expect(
    firstRef.mock.calls.map(([element]) => element?.tagName ?? null),
  ).toEqual(['DIV', null]);
});

it.each(['release', 'native'] as const)(
  'keeps immediate suppression after switching to %s and reattaching the same anchor',
  (nextMode) => {
    const calls: string[] = [];
    function Renderer({ mode, href }: { mode: LinkMode; href: string }) {
      const binding = useLinkInteraction(recording(mode, calls));
      const ref = useCallback(
        (element: HTMLAnchorElement | null) => binding.ref(element),
        [binding.ref, href],
      );
      return (
        <a
          href={href}
          ref={ref}
          onClickCapture={binding.suppressClick}
          onClick={(event) => calls.push(`click:${event.defaultPrevented}`)}
        >
          <span
            onClickCapture={(event) =>
              calls.push(`capture:${event.defaultPrevented}`)
            }
          >
            Guide
          </span>
        </a>
      );
    }
    const { getByRole, getByText, rerender } = render(
      <Renderer mode="immediate" href="/first" />,
    );
    const anchor = getByRole('link');
    press(getByText('Guide'));
    rerender(<Renderer mode={nextMode} href="/second" />);

    expect(getByRole('link')).toBe(anchor);
    expect(click(getByText('Guide'))).toBe(true);
    // A later capture handler sees the prevented React event; bubbling continues.
    expect(calls).toEqual(['navigate:/first', 'capture:true', 'click:true']);
  },
);

it('rejects immediate navigation when its guard removes the root', () => {
  const navigate = vi.fn();
  function Link() {
    const [visible, setVisible] = useState(true);
    const binding = useLinkInteraction({
      mode: 'immediate',
      beforeNavigate: () => {
        flushSync(() => setVisible(false));
        return true;
      },
      navigate,
    });
    return visible ? (
      <a href="/guide" ref={binding.ref}>
        Guide
      </a>
    ) : null;
  }
  const { getByRole } = render(<Link />);
  const anchor = getByRole('link');

  press(anchor);
  expect(anchor.isConnected).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
});

it('rejects activation while a same-anchor reattachment detaches the ref but lets earlier suppression settle', () => {
  const beforeNavigate = vi.fn(() => true);
  const calls: string[] = [];
  let onDetach: ((anchor: HTMLAnchorElement) => void) | null = null;
  let binding: LinkInteractionBinding<string, HTMLAnchorElement> | null = null;
  const callerRef = (anchor: HTMLAnchorElement | null) =>
    anchor ? () => onDetach?.(anchor) : undefined;
  function Renderer({ mode, href }: { mode: LinkMode; href: string }) {
    binding = useLinkInteraction<string, HTMLAnchorElement>({
      ...(mode === 'immediate'
        ? { ...recording(mode, calls), beforeNavigate }
        : recording(mode, calls)),
      forwardedRef: callerRef,
    });
    const { ref: bind, suppressClick } = binding;
    const ref = useCallback(
      (element: HTMLAnchorElement | null) => bind(element),
      [bind, href],
    );
    return (
      <a href={href} ref={ref} onClickCapture={suppressClick}>
        Guide
      </a>
    );
  }
  const { getByRole, rerender } = render(
    <Renderer mode="immediate" href="/first" />,
  );
  const anchor = getByRole('link');
  press(anchor);

  let isDetachedClickPrevented: boolean | null = null;
  onDetach = (detached) => {
    isDetachedClickPrevented = click(detached);
    press(detached);
  };
  rerender(<Renderer mode="immediate" href="/second" />);
  expect(isDetachedClickPrevented).toBe(true);
  expect(beforeNavigate).toHaveBeenCalledTimes(1);
  expect(calls).toEqual(['navigate:/first']);

  onDetach = null;
  press(anchor);
  expect(calls).toEqual(['navigate:/first', 'navigate:/second']);

  // A held release gesture cannot be matched while the ref is detached.
  rerender(<Renderer mode="release" href="/second" />);
  press(anchor);
  let detachedMatch: unknown = 'not called';
  onDetach = (detached) => {
    detachedMatch = binding?.matchClick(clickEvent(detached));
  };
  rerender(<Renderer mode="release" href="/third" />);
  expect(calls).toEqual([
    'navigate:/first',
    'navigate:/second',
    'prepare:/second',
  ]);
  expect(detachedMatch).toBeNull();
});

it('rejects a release click consumed after its guard removes the root', () => {
  const calls: string[] = [];
  function Link() {
    const [visible, setVisible] = useState(true);
    const binding = useLinkInteraction(recording('release', calls));
    return visible ? (
      <a
        href="/guide"
        ref={binding.ref}
        onClick={(event) => {
          const candidate = binding.matchClick(event.nativeEvent);
          flushSync(() => setVisible(false));
          if (candidate?.consume()) calls.push('accept');
        }}
      >
        Guide
      </a>
    ) : null;
  }
  const { getByRole } = render(<Link />);
  const anchor = getByRole('link');

  press(anchor);
  click(anchor);
  expect(anchor.isConnected).toBe(false);
  expect(calls).toEqual(['prepare:/guide']);
});
