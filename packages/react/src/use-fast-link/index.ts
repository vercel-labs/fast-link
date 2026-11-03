'use client';

import { createFastLink, type FastLinkOptions } from '@fast-link/core';
import {
  useCallback,
  useMemo,
  useRef,
  type ForwardedRef,
  type MouseEventHandler,
} from 'react';

import { useController, useClientLayoutEffect } from '../use-controller';

/**
 * Returns stable ref and click-capture bindings for an anchor or containing element.
 *
 * Spread both bindings on the same element after its other props.
 * Pass core options, an optional `forwardedRef`, and a caller `onClickCapture`.
 *
 * - Composes `forwardedRef` with the returned ref.
 * - Calls the committed `onClickCapture` after core suppression, even when prevented.
 * - Applies option updates after React commits, preserving any pending
 *   follow-up click.
 * - Destroys the controller when the root changes or unmounts.
 * - Renders no element and attaches no controller during server rendering.
 */
export function useFastLink<T extends HTMLElement = HTMLElement>({
  forwardedRef = null,
  onClickCapture,
  ...options
}: FastLinkOptions & {
  forwardedRef?: ForwardedRef<T>;
  onClickCapture?: MouseEventHandler<T>;
}): { ref: (element: T | null) => void; onClickCapture: MouseEventHandler<T> } {
  const committedCapture = useRef(onClickCapture);
  // Ref reassignment can synchronously dispatch a click during the next effect.
  useClientLayoutEffect(() => {
    committedCapture.current = onClickCapture;
  }, [onClickCapture]);
  const { ref: attach, controller } = useController(
    createFastLink,
    options,
    forwardedRef,
  );

  const captureClick = useCallback<MouseEventHandler<T>>((event) => {
    controller.current?.suppressClick(event);
    committedCapture.current?.(event);
  }, []);

  return useMemo(
    () => ({ ref: attach, onClickCapture: captureClick }),
    [attach, captureClick],
  );
}
