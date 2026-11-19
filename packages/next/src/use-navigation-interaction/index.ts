'use client';

import type { LinkInteractionOptions, LinkMode } from '@fast-link/core';
import {
  useLinkInteraction,
  type LinkInteractionBinding,
} from '@fast-link/react';
import {
  useLayoutEffect,
  useRef,
  type ForwardedRef,
  type RefObject,
} from 'react';

import {
  navigate,
  prepareNavigation,
  type PreparedNavigation,
  type Routing,
} from '../navigation';

/** A Next Link `onNavigate` guard. Calling `preventDefault()` cancels navigation. */
export type NavigationGuard = (event: { preventDefault(): void }) => void;

/** Inputs read when an interaction runs, after any guard has committed new props. */
export type CommittedNavigation = {
  routing: Routing;
  /** Runs before navigation in immediate mode. */
  onNavigate?: NavigationGuard;
};

/**
 * Binds one link interaction controller in the selected mode, defaulting to
 * release. Callbacks read the committed inputs, which are published before the
 * binding updates the controller or replaces a caller ref.
 */
export function useNavigationInteraction<
  C extends CommittedNavigation,
  T extends HTMLElement,
>(
  mode: LinkMode = 'release',
  current: C,
  forwardedRef?: ForwardedRef<T>,
): {
  binding: LinkInteractionBinding<PreparedNavigation, T>;
  committed: RefObject<C>;
} {
  const committed = useRef(current);
  // Declared before the binding so its layout effects observe current inputs.
  useLayoutEffect(() => {
    committed.current = current;
  });
  const binding = useLinkInteraction<PreparedNavigation, T>({
    ...selectInteraction(mode, committed),
    forwardedRef,
  });
  return { binding, committed };
}

/** Runs a guard and reports whether navigation may continue. */
export function runNavigationGuard(
  guard: NavigationGuard | undefined,
): boolean {
  let isCanceled = false;
  guard?.({
    preventDefault() {
      isCanceled = true;
    },
  });
  return !isCanceled;
}

// Constructs only the selected mode's callbacks.
function selectInteraction(
  mode: LinkMode,
  committed: RefObject<CommittedNavigation>,
): LinkInteractionOptions<PreparedNavigation> {
  if (mode === 'native') return { mode };
  if (mode === 'immediate') {
    return {
      mode,
      beforeNavigate: () => runNavigationGuard(committed.current.onNavigate),
      navigate: (intent) => navigate(committed.current.routing, intent),
    };
  }
  return {
    mode,
    prepare: (intent) => prepareNavigation(committed.current.routing, intent),
  };
}
