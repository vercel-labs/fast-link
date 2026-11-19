'use client';

import type Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  ComponentPropsWithoutRef,
  ForwardedRef,
  MouseEventHandler,
} from 'react';

import { getLinkDestination } from '../link-destination';
import type { NavigationOptions } from '../navigation-policy';
import { useNavigationCapture } from '../use-navigation-capture';

type LinkProps = ComponentPropsWithoutRef<typeof Link>;

/** Routing options and guards for a custom renderer that exposes an anchor ref. */
export type UseFastLinkOptions = Pick<
  LinkProps,
  | 'href'
  | 'replace'
  | 'scroll'
  | 'onNavigate'
  | Extract<'transitionTypes', keyof LinkProps>
> &
  NavigationOptions & {
    /** Composed with the returned ref and cleaned up on replacement or unmount. */
    forwardedRef?: ForwardedRef<HTMLAnchorElement>;
    /** Runs after follow-up click suppression and before release acceptance; may cancel with preventDefault(). */
    onClickCapture?: MouseEventHandler<HTMLAnchorElement>;
  };

/**
 * Returns stable ref and click-capture bindings for a custom renderer's anchor
 * in the selected `mode`. Spread both after the renderer's other props.
 *
 * - `release` (default) prepares on press and accepts during click capture,
 *   after the supplied `onClickCapture` and `onNavigate`. Later child handlers
 *   cannot veto it. Use `FastLink` when the renderer's own click and
 *   navigation guards must run first.
 * - `immediate` runs the supplied `onNavigate`, then navigates on press.
 * - `native` leaves navigation to the renderer.
 * - The renderer owns prefetching, click handlers, and pending state.
 */
export function useFastLink({
  mode,
  navigationPolicy,
  onFastNavigate,
  forwardedRef,
  onClickCapture,
  onNavigate,
  ...link
}: UseFastLinkOptions): ReturnType<
  typeof useNavigationCapture<HTMLAnchorElement>
> {
  const router = useRouter();
  return useNavigationCapture<HTMLAnchorElement>({
    mode,
    forwardedRef,
    onClickCapture,
    onNavigate,
    routing: {
      router,
      navigationPolicy,
      onFastNavigate,
      destination: (intent) => getLinkDestination(link.href, intent.url),
      method: link.replace ? 'replace' : 'push',
      scroll: link.scroll,
      transitionTypes: link.transitionTypes,
    },
  });
}
