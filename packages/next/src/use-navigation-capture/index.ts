'use client';

import type { LinkMode } from '@fast-link/core';
import type { LinkInteractionBinding } from '@fast-link/react';
import {
  useState,
  type ForwardedRef,
  type MouseEvent,
  type MouseEventHandler,
  type RefObject,
} from 'react';

import { navigate, type PreparedNavigation, type Routing } from '../navigation';
import {
  runNavigationGuard,
  useNavigationInteraction,
  type NavigationGuard,
} from '../use-navigation-interaction';

type CaptureInput<T extends HTMLElement> = {
  mode?: LinkMode;
  routing: Routing;
  forwardedRef?: ForwardedRef<T>;
  onClickCapture?: MouseEventHandler<T>;
  onNavigate?: NavigationGuard;
};

type CommittedCapture<T extends HTMLElement> = Omit<
  CaptureInput<T>,
  'mode' | 'forwardedRef'
>;

/**
 * Binds a region or custom renderer that accepts release clicks during capture,
 * after the supplied `onClickCapture` and `onNavigate` guards. Later child
 * handlers cannot veto an accepted navigation.
 */
export function useNavigationCapture<T extends HTMLElement>({
  mode,
  forwardedRef,
  ...current
}: CaptureInput<T>): {
  ref(element: T | null): void;
  onClickCapture: MouseEventHandler<T>;
} {
  const { binding, committed } = useNavigationInteraction(
    mode,
    current,
    forwardedRef,
  );
  const [handlers] = useState(() => ({
    ref: binding.ref,
    onClickCapture: (event: MouseEvent<T>) =>
      acceptCapturedClick(binding, committed, event),
  }));
  return handlers;
}

// Each guard can commit new props synchronously, so read inputs after each one.
function acceptCapturedClick<T extends HTMLElement>(
  binding: LinkInteractionBinding<PreparedNavigation, T>,
  committed: RefObject<CommittedCapture<T>>,
  event: MouseEvent<T>,
): void {
  binding.suppressClick(event);
  const candidate = binding.matchClick(event.nativeEvent);
  try {
    committed.current.onClickCapture?.(event);
    if (!candidate || event.defaultPrevented) return;
    if (!runNavigationGuard(committed.current.onNavigate)) {
      event.preventDefault();
      return;
    }
    const activation = candidate.consume();
    if (!activation) return;
    event.preventDefault();
    navigate(committed.current.routing, activation.intent, activation.prepared);
  } finally {
    candidate?.discard();
  }
}
