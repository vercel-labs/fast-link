'use client';

import {
  createLinkInteraction,
  type LinkInteractionController,
  type LinkInteractionOptions,
  type PreparedClick,
} from '@fast-link/core';
import {
  useState,
  type ForwardedRef,
  type MouseEvent as ReactMouseEvent,
} from 'react';

import { useRootBinding } from '../root-binding';

/** Stable handlers for one root bound by `useLinkInteraction`. */
export interface LinkInteractionBinding<
  P,
  T extends HTMLElement = HTMLElement,
> {
  /** Attach to the anchor or region that the controller handles. */
  ref(element: T | null): void;
  /**
   * In release mode, matches the native click before synchronous guards. Consume
   * or discard every returned candidate. Returns `null` in other modes and
   * while the ref is detached.
   */
  matchClick(event: MouseEvent): PreparedClick<P> | null;
  /**
   * Drops release-mode preparation and matched candidates. Never clears
   * follow-up click suppression.
   */
  discard(): void;
  /**
   * Call from a click-capture handler before matching. Prevents the follow-up
   * click of an accepted immediate press on both the native event and the React
   * event, without stopping propagation. Returns whether the click is suppressed.
   */
  suppressClick(event: ReactMouseEvent): boolean;
}

/**
 * Binds one core link interaction controller to a React-owned root in the
 * selected mode, without rendering state.
 *
 * Changing `mode` keeps the element, the controller, and any follow-up click
 * suppression. Committed options replace the controller's copy before a caller
 * ref changed in the same commit is replaced. Reattaching the same element keeps
 * pending work, navigation is rejected while the ref is detached, and replacing
 * the element or unmounting destroys the controller.
 */
export function useLinkInteraction<P, T extends HTMLElement = HTMLElement>({
  forwardedRef = null,
  ...options
}: LinkInteractionOptions<P> & {
  forwardedRef?: ForwardedRef<T>;
}): LinkInteractionBinding<P, T> {
  const { handlers, controller } = useRootBinding<
    P,
    LinkInteractionOptions<P>,
    LinkInteractionController<P>,
    T
  >(createLinkInteraction, options, forwardedRef);
  const [binding] = useState(
    (): LinkInteractionBinding<P, T> => ({
      ...handlers,
      suppressClick(event) {
        const isSuppressed =
          controller()?.suppressClick(event.nativeEvent) ?? false;
        // Core prevents the native event; later React handlers read the wrapper.
        if (isSuppressed) event.preventDefault();
        return isSuppressed;
      },
    }),
  );
  return binding;
}
