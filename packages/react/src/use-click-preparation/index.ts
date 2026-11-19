'use client';

import {
  createClickPreparation,
  type ClickPreparationOptions,
  type PreparedClick,
} from '@fast-link/core';
import type { ForwardedRef } from 'react';

import { useRootBinding } from '../root-binding';

/**
 * Binds core click preparation to a React-owned root without rendering state.
 *
 * Attach `ref` to the root and pass the native click to `matchClick` before
 * synchronous guards. Committed options replace the controller's copy; a caller
 * ref changed in the same commit is replaced afterward. Reattaching the same
 * element keeps preparation, clicks are rejected while the ref is detached, and
 * replacing the element or unmounting destroys the controller.
 */
export function useClickPreparation<P, T extends HTMLElement = HTMLElement>({
  forwardedRef = null,
  ...options
}: ClickPreparationOptions<P> & { forwardedRef?: ForwardedRef<T> }): {
  ref(element: T | null): void;
  matchClick(event: MouseEvent): PreparedClick<P> | null;
  discard(): void;
} {
  return useRootBinding(
    createClickPreparation<P>,
    'discard',
    options,
    forwardedRef,
  ).handlers;
}
