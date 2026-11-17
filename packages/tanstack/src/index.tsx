'use client';

import type { FastLinkIntent } from '@fast-link/core';
import { useFastLink as useReactFastLink } from '@fast-link/react';
import {
  useLinkProps,
  useRouter,
  type AnyRouter,
  type LinkComponentProps,
  type NavigateOptions,
  type RegisteredRouter,
} from '@tanstack/react-router';
import { useCallback, type ComponentPropsWithRef } from 'react';
import type { ForwardedRef, MouseEventHandler, ReactNode, JSX } from 'react';

/** Controls early navigation. Click-time guards should use `enabled={false}`. */
export type FastNavigationOptions = {
  enabled?: boolean;
  onFastNavigate?: (intent: FastLinkIntent) => void;
};

/** TanStack Link props, including typed destinations, params, search and masks. */
export type FastLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = LinkComponentProps<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  FastNavigationOptions;

/** Starts eligible TanStack Router navigation on primary mouse press. */
export function FastLink<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(props: FastLinkProps<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): JSX.Element {
  const attach = useFastLink<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>(props);
  const forwardElement = useCallback(
    (element: Element | null) => {
      attach.ref(element instanceof HTMLAnchorElement ? element : null);
    },
    [attach.ref],
  );
  const rendered: ComponentPropsWithRef<'a'> & FastNavigationOptions =
    useLinkProps({ ...props, children: undefined }, forwardElement);
  const {
    enabled: _enabled,
    onFastNavigate: _observe,
    ...anchorProps
  } = rendered;
  const children =
    typeof props.children === 'function'
      ? props.children({
          isActive:
            'data-status' in anchorProps &&
            anchorProps['data-status'] === 'active',
        })
      : props.children;
  return (
    <a {...anchorProps} onClickCapture={attach.onClickCapture}>
      {children}
    </a>
  );
}

/** Routing options and bindings for a custom TanStack Link renderer. */
export type UseFastLinkOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  FastNavigationOptions & {
    disabled?: boolean;
    forwardedRef?: ForwardedRef<HTMLAnchorElement>;
    ref?: ForwardedRef<HTMLAnchorElement>;
    onClickCapture?: MouseEventHandler<HTMLAnchorElement>;
  };

/** Spread both bindings onto the TanStack Link anchor after other props. */
export function useFastLink<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  options: UseFastLinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): ReturnType<typeof useReactFastLink<HTMLAnchorElement>> {
  const router = useRouter();
  return useReactFastLink<HTMLAnchorElement>({
    enabled:
      options.enabled !== false && !options.disabled && !options.reloadDocument,
    forwardedRef: options.forwardedRef ?? options.ref,
    onClickCapture: options.onClickCapture,
    onFastNavigate: options.onFastNavigate,
    navigate: () => {
      router.navigate(options);
    },
  });
}

/** Region-level options cannot infer routing props from ordinary anchors. */
export type FastLinkRegionProps = FastNavigationOptions & {
  children: ReactNode;
  replace?: boolean;
  resetScroll?: boolean;
};

/** Applies one navigation policy to ordinary same-origin anchors. */
export function FastLinkRegion({
  children,
  enabled,
  onFastNavigate,
  replace,
  resetScroll,
}: FastLinkRegionProps): JSX.Element {
  const router = useRouter();
  const attach = useReactFastLink<HTMLDivElement>({
    enabled,
    onFastNavigate,
    navigate: (intent) => {
      router.navigate({
        href: intent.url.pathname + intent.url.search + intent.url.hash,
        replace,
        resetScroll,
      });
    },
  });
  return (
    <div {...attach} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}

export type { FastLinkIntent } from '@fast-link/core';
