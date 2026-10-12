'use client';

import { runFastNavigation } from '@fast-link/core';
import { useFastLink as useReactFastLink } from '@fast-link/react';
import type Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useMemo,
  type ComponentPropsWithoutRef,
  type ForwardedRef,
  type MouseEventHandler,
} from 'react';

import type {
  FastRouterProposal,
  NavigationOptions,
} from '../navigation-policy';

type LinkProps = ComponentPropsWithoutRef<typeof Link>;

/**
 * Next Link routing props, ref, and capture handler for a custom renderer.
 * Version-specific routing props follow the installed Next Link types.
 */
export type UseFastLinkOptions<T extends HTMLElement = HTMLElement> = Partial<
  Pick<
    LinkProps,
    | 'href'
    | 'as'
    | 'legacyBehavior'
    | 'replace'
    | 'scroll'
    | 'onNavigate'
    | Extract<'transitionTypes', keyof LinkProps>
  >
> &
  NavigationOptions & {
    /** Composed with the returned ref and cleaned up on replacement or unmount. */
    forwardedRef?: ForwardedRef<T>;
    /** Runs after suppression, including when the click is default-prevented. */
    onClickCapture?: MouseEventHandler<T>;
  };

/**
 * Returns ref and click-capture bindings for early navigation in a custom link.
 * Pass the renderer's Next Link routing props and attach the ref to its anchor
 * or fallback element. Spread both bindings after its other props.
 *
 * - Leaves navigation to the renderer when `href` is missing, the root is not
 *   an anchor, `as` is supplied, or `legacyBehavior` is true.
 * - The renderer owns prefetching, click handlers, and pending state.
 * - The hook composes the caller's `onClickCapture` after core suppression.
 * - Option updates preserve any pending follow-up click.
 * - Root replacement and unmount destroy the controller and clean up refs.
 */
export function useFastLink<T extends HTMLElement = HTMLElement>({
  enabled,
  navigationPolicy,
  onFastNavigate,
  forwardedRef,
  onClickCapture,
  ...link
}: UseFastLinkOptions<T>): ReturnType<typeof useReactFastLink<T>> {
  const router = useRouter();
  const attachAnchor = useReactFastLink<T>({
    enabled:
      enabled !== false &&
      link.href !== undefined &&
      link.as === undefined &&
      !link.legacyBehavior,
    forwardedRef,
    onClickCapture,
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
  const attach = useCallback(
    (element: T | null) => {
      if (element?.tagName === 'A') {
        attachNative.ref(null);
        attachAnchor.ref(element);
      } else {
        attachAnchor.ref(null);
        attachNative.ref(element);
      }
    },
    [attachAnchor.ref, attachNative.ref],
  );
  return useMemo(
    () => ({ ref: attach, onClickCapture: attachAnchor.onClickCapture }),
    [attach, attachAnchor.onClickCapture],
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
