'use client';

import { runFastNavigation } from '@fast-link/core';
import { useFastLink as useReactFastLink } from '@fast-link/react';
import type Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  type ComponentPropsWithoutRef,
  type ForwardedRef,
} from 'react';

import type {
  FastRouterProposal,
  NavigationOptions,
} from '../navigation-policy';

type LinkProps = ComponentPropsWithoutRef<typeof Link>;

/** Next Link routing props and an optional ref for a custom renderer. */
export type UseFastLinkOptions<T extends HTMLElement = HTMLElement> = Partial<
  Pick<
    LinkProps,
    | 'href'
    | 'as'
    | 'legacyBehavior'
    | 'replace'
    | 'scroll'
    | 'onNavigate'
    | 'transitionTypes'
  >
> &
  NavigationOptions & {
    /** Composed with the returned ref and cleaned up on replacement or unmount. */
    forwardedRef?: ForwardedRef<T>;
  };

/**
 * Returns a callback ref for early App Router navigation in a custom link.
 * Pass the renderer's Next Link routing props and attach the ref to its anchor
 * or fallback element.
 *
 * - Leaves navigation to the renderer when `href` is missing, the root is not
 *   an anchor, `as` is supplied, or `legacyBehavior` is true.
 * - The renderer owns prefetching, click handlers, and pending state.
 * - Option updates preserve any pending follow-up click.
 * - Root replacement and unmount destroy the controller and clean up refs.
 */
export function useFastLink<T extends HTMLElement = HTMLElement>({
  enabled,
  navigationPolicy,
  onFastNavigate,
  forwardedRef,
  ...link
}: UseFastLinkOptions<T>): (element: T | null) => void {
  const router = useRouter();
  const attachAnchor = useReactFastLink<T>({
    enabled:
      enabled !== false &&
      link.href !== undefined &&
      link.as === undefined &&
      !link.legacyBehavior,
    forwardedRef,
    navigate: (intent) => {
      if (link.href === undefined) return;
      let canceled = false;
      link.onNavigate?.({
        preventDefault() {
          canceled = true;
        },
      });
      if (canceled) return;

      const destination = getRouterDestination(link.href, intent.url);
      const method = link.replace ? 'replace' : 'push';
      const options = {
        scroll: link.scroll,
        transitionTypes:
          link.transitionTypes === undefined
            ? undefined
            : [...link.transitionTypes],
      };
      const proposed: FastRouterProposal = {
        destination,
        method,
        scroll: options.scroll,
      };
      runFastNavigation(intent, {
        defaultRouterDecision: { kind: 'router' },
        policy: navigationPolicy
          ? () => navigationPolicy(intent, proposed)
          : undefined,
        observe: (decision) => onFastNavigate?.(intent, decision),
        route: (decision) =>
          router[method](destination, {
            ...options,
            scroll: decision.scroll ?? options.scroll,
          }),
      });
    },
  });
  // Keep non-anchor roots native while composing their refs.
  const attachNative = useReactFastLink<T>({ enabled: false, forwardedRef });
  return useCallback(
    (element: T | null) => {
      if (element?.tagName === 'A') {
        attachNative(null);
        attachAnchor(element);
      } else {
        attachAnchor(null);
        attachNative(element);
      }
    },
    [attachAnchor, attachNative],
  );
}

function getRouterDestination(
  href: LinkProps['href'],
  resolvedUrl: URL,
): string {
  if (typeof href === 'string') return href;
  if (href.protocol || href.host) return resolvedUrl.href;
  return (href.pathname ?? '') + resolvedUrl.search + resolvedUrl.hash;
}
