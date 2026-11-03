'use client';

import {
  createClickPreparation,
  type ClickPreparationOptions,
  type PreparedClick,
} from '@fast-link/core';
import { useCallback, useMemo, type ForwardedRef } from 'react';

import { useController } from '../use-controller';

/**
 * Binds core click preparation to React refs and committed options without rendering state.
 * Attach the ref to the controlled root; pass native clicks to matchClick before guards.
 * Root replacement and unmount destroy the controller and compose ref cleanup.
 */
export function useClickPreparation<P, T extends HTMLElement = HTMLElement>({
  forwardedRef,
  ...options
}: ClickPreparationOptions<P> & { forwardedRef?: ForwardedRef<T> }): {
  ref(element: T | null): void;
  matchClick(event: MouseEvent): PreparedClick<P> | null;
  discard(): void;
} {
  const { ref, controller } = useController<
    T,
    ClickPreparationOptions<P>,
    ReturnType<typeof createClickPreparation<P>>
  >(createClickPreparation, options, forwardedRef);
  const matchClick = useCallback(
    (event: MouseEvent) => controller.current?.matchClick(event) ?? null,
    [controller],
  );
  const discard = useCallback(
    () => controller.current?.discard(),
    [controller],
  );
  return useMemo(
    () => ({ ref, matchClick, discard }),
    [ref, matchClick, discard],
  );
}
