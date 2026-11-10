'use client';

import type { ClickPreparationOptions, PreparedClick } from '@fast-link/core';
import { useEffect, useLayoutEffect, useState, type ForwardedRef } from 'react';

import { createPreparationBinding } from './binding';

const useClientLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Binds core click preparation to React refs and committed options without rendering state.
 * Attach the ref to the controlled root; pass native clicks to matchClick before guards.
 * Root replacement and unmount destroy the controller and compose ref cleanup.
 */
export function useClickPreparation<P, T extends HTMLElement = HTMLElement>({
  forwardedRef = null,
  ...options
}: ClickPreparationOptions<P> & { forwardedRef?: ForwardedRef<T> }): {
  ref(element: T | null): void;
  matchClick(event: MouseEvent): PreparedClick<P> | null;
  discard(): void;
} {
  const [binding] = useState(() =>
    createPreparationBinding(options, forwardedRef),
  );

  useClientLayoutEffect(binding.mount, [binding]);
  useClientLayoutEffect(() => {
    binding.update(options, forwardedRef);
  });

  return binding.handlers;
}
