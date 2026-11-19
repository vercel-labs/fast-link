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
  /** Drops release-mode preparation and matched candidates. */
  discardClick(): void;
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
  const {
    handlers: { ref, matchClick, discard },
    controller,
  } = useRootBinding<P, LinkInteractionOptions<P>, AttachedInteraction<P>, T>(
    createAttachedInteraction,
    options,
    forwardedRef,
  );
  const [handlers] = useState(
    (): LinkInteractionBinding<P, T> => ({
      ref,
      matchClick,
      discardClick: discard,
      suppressClick(event) {
        const isSuppressed =
          controller()?.suppressClick(event.nativeEvent) ?? false;
        // Core prevents the native event; later React handlers read the wrapper.
        if (isSuppressed) event.preventDefault();
        return isSuppressed;
      },
    }),
  );
  return handlers;
}

/** The core controller in the root binding's shape. */
type AttachedInteraction<P> = LinkInteractionController<P> & {
  discard(): void;
};

/**
 * Adapts the core controller to the root binding and rejects a detached
 * immediate press on every update. The binding rejects click activation itself,
 * but an immediate press starts inside core from the options' callbacks, which
 * only this mode-aware adapter can wrap.
 */
function createAttachedInteraction<P>(
  root: HTMLElement,
  options: LinkInteractionOptions<P>,
  isAttached: () => boolean,
): AttachedInteraction<P> {
  const controller = createLinkInteraction(
    root,
    rejectDetachedPress(options, isAttached),
  );
  return {
    ...controller,
    discard: controller.discardClick,
    update: (nextOptions) =>
      controller.update(rejectDetachedPress(nextOptions, isAttached)),
  };
}

/** Rejects an immediate press while the ref is detached, before the guard and after it returns. */
function rejectDetachedPress<P>(
  options: LinkInteractionOptions<P>,
  isAttached: () => boolean,
): LinkInteractionOptions<P> {
  if (options.mode !== 'immediate') return options;
  return {
    mode: 'immediate',
    beforeNavigate(intent) {
      if (!isAttached()) return false;
      return options.beforeNavigate?.(intent) ?? true;
    },
    navigate(intent) {
      if (isAttached()) options.navigate(intent);
    },
  };
}
