'use client';

import { useClickPreparation } from '@fast-link/react';
import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type ForwardedRef,
  type MouseEventHandler,
} from 'react';

import type {
  createPreparedNavigation,
  PreparedNavigation,
} from '../prepared-navigation';

type CaptureOptions<T extends HTMLElement> = {
  enabled?: boolean;
  navigation: ReturnType<typeof createPreparedNavigation>;
  forwardedRef?: ForwardedRef<T>;
  onClickCapture?: MouseEventHandler<T>;
  onNavigate?: (event: { preventDefault(): void }) => void;
};

/** Accepts a click during capture, after the supplied synchronous guards. */
export function useNavigationCapture<T extends HTMLElement>(
  options: CaptureOptions<T>,
): {
  ref(element: T | null): void;
  onClickCapture: MouseEventHandler<T>;
} {
  const committed = useRef(options);
  // Ref reassignment can dispatch a click; publish its callbacks first.
  useLayoutEffect(() => {
    committed.current = options;
  });
  const { ref, matchClick } = useClickPreparation<PreparedNavigation, T>({
    enabled: options.enabled,
    prepare: options.navigation.prepare,
    forwardedRef: options.forwardedRef,
  });
  const onClickCapture = useCallback<MouseEventHandler<T>>(
    (event) => {
      const candidate = matchClick(event.nativeEvent);
      try {
        committed.current.onClickCapture?.(event);
        if (!candidate || event.defaultPrevented) return;
        committed.current.onNavigate?.({
          preventDefault: () => event.preventDefault(),
        });
        if (event.defaultPrevented) return;
        const activation = candidate.consume();
        if (!activation) return;
        event.preventDefault();
        committed.current.navigation.navigate(activation);
      } finally {
        candidate?.discard();
      }
    },
    [matchClick],
  );
  return useMemo(() => ({ ref, onClickCapture }), [ref, onClickCapture]);
}
