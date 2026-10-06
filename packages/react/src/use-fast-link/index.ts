'use client';

import {
  createFastLink,
  type FastLinkController,
  type FastLinkOptions,
} from '@fast-link/core';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ForwardedRef,
} from 'react';

const useClientLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

type AssignedRef<T> = {
  ref: ForwardedRef<T>;
  cleanup: (() => void) | null;
};

function assignRef<T>({
  assigned,
  nextRef,
  element,
}: {
  assigned: AssignedRef<T>;
  nextRef: ForwardedRef<T>;
  element: T | null;
}): void {
  if (assigned.cleanup) {
    assigned.cleanup();
  } else if (typeof assigned.ref === 'function') {
    assigned.ref(null);
  } else if (assigned.ref) {
    assigned.ref.current = null;
  }

  assigned.ref = nextRef;
  assigned.cleanup = null;
  if (!element) return;

  if (typeof nextRef === 'function') {
    const cleanup = nextRef(element);
    assigned.cleanup = typeof cleanup === 'function' ? cleanup : null;
  } else if (nextRef) {
    nextRef.current = element;
  }
}

/**
 * Returns a callback ref that attaches Fast Link to an anchor or containing element.
 *
 * Pass core options and an optional `forwardedRef`.
 *
 * - Composes `forwardedRef` with the returned ref.
 * - Applies option updates after React commits, preserving any pending
 *   follow-up click.
 * - Destroys the controller when the root changes or unmounts.
 * - Renders no element and attaches no controller during server rendering.
 */
export function useFastLink<T extends HTMLElement = HTMLElement>({
  forwardedRef = null,
  ...options
}: FastLinkOptions & {
  forwardedRef?: ForwardedRef<T>;
}): (element: T | null) => void {
  const element = useRef<T | null>(null);
  const controller = useRef<FastLinkController | null>(null);
  const committed = useRef({ options, forwardedRef });
  const assigned = useRef<AssignedRef<T>>({ ref: null, cleanup: null });

  useClientLayoutEffect(() => {
    committed.current = { options, forwardedRef };
    controller.current?.update(options);
    if (element.current && assigned.current.ref !== forwardedRef) {
      assignRef({
        assigned: assigned.current,
        nextRef: forwardedRef,
        element: element.current,
      });
    }
  }, [options, forwardedRef]);

  return useCallback((nextElement: T | null) => {
    if (element.current === nextElement) return;

    controller.current?.destroy();
    controller.current = null;
    if (element.current) {
      assignRef({ assigned: assigned.current, nextRef: null, element: null });
    }
    element.current = nextElement;

    if (nextElement) {
      assignRef({
        assigned: assigned.current,
        nextRef: committed.current.forwardedRef,
        element: nextElement,
      });
      controller.current = createFastLink(
        nextElement,
        committed.current.options,
      );
    }
  }, []);
}
