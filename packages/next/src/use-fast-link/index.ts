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
import { createPreparedNavigation } from '../prepared-navigation';
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
    forwardedRef?: ForwardedRef<HTMLAnchorElement>;
    /** Runs before acceptance and may cancel with preventDefault(). */
    onClickCapture?: MouseEventHandler<HTMLAnchorElement>;
  };

/**
 * Prepares on press and accepts navigation during click capture.
 * Spread both bindings on the renderer's anchor. The supplied onClickCapture and
 * onNavigate guards may cancel; later child handlers cannot veto a committed route.
 * Use FastLink when the renderer's own click and navigation guards must run first.
 */
export function useFastLink({
  enabled,
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
  const navigation = createPreparedNavigation(router, {
    navigationPolicy,
    onFastNavigate,
    destination: (intent) => getLinkDestination(link.href, intent.url),
    method: link.replace ? 'replace' : 'push',
    scroll: link.scroll,
    transitionTypes: link.transitionTypes,
  });
  return useNavigationCapture({
    enabled,
    navigation,
    forwardedRef,
    onClickCapture,
    onNavigate,
  });
}
