import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ForwardedRef,
  type RefObject,
} from 'react';

export const useClientLayoutEffect =
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

/** Shares committed options, ref composition, and teardown across controller bindings. */
export function useController<
  T extends HTMLElement,
  O,
  C extends { update(options: O): void; destroy(): void },
>(
  create: (root: T, options: O) => C,
  options: O,
  forwardedRef: ForwardedRef<T> = null,
): { ref: (element: T | null) => void; controller: RefObject<C | null> } {
  const element = useRef<T | null>(null);
  const controller = useRef<C | null>(null);
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
  const ref = useCallback(
    (nextElement: T | null) => {
      if (element.current === nextElement) return;
      controller.current?.destroy();
      controller.current = null;
      if (element.current)
        assignRef({ assigned: assigned.current, nextRef: null, element: null });
      element.current = nextElement;
      if (nextElement) {
        assignRef({
          assigned: assigned.current,
          nextRef: committed.current.forwardedRef,
          element: nextElement,
        });
        controller.current = create(nextElement, committed.current.options);
      }
    },
    [create],
  );
  return { ref, controller };
}
