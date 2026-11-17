'use client';

import {
  runFastNavigation,
  type FastLinkIntent,
  type FastNavigationDecision,
} from '@fast-link/core';
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

/**
 * Describes the TanStack navigation before policy. Mutations do not change its
 * destination or history method.
 */
export type FastRouterProposal = Readonly<{
  /**
   * URL the router would commit, including the basepath. It differs from the
   * press URL when the router does not own the destination.
   */
  destination: string;
  method: 'push' | 'replace';
  /** TanStack `resetScroll`; a router decision's `scroll` overrides it. */
  scroll?: boolean;
  /**
   * Whether the router serves the destination. Region links outside the
   * basepath, without a matching route, or matching a server-only route are
   * not owned. Typed links are always owned.
   */
  owned: boolean;
}>;

/**
 * Selects navigation synchronously for an accepted press.
 *
 * - Use document navigation when ownership is foreign or unknown.
 * - Router decisions can override only the proposed scroll behavior.
 */
export type FastNavigationPolicy = (
  intent: FastLinkIntent,
  proposed: FastRouterProposal,
) => FastNavigationDecision;

/** Navigation controls shared by TanStack links, hooks and regions. */
export type FastNavigationOptions = {
  /** Set `false` to disable early navigation. Use it for click-time guards. */
  enabled?: boolean;
  /**
   * Selects navigation for an eligible press. Omit to route owned destinations
   * through TanStack Router and load other URLs as documents.
   */
  navigationPolicy?: FastNavigationPolicy;
  /** Observes the decision before navigation. Navigation still runs if it throws. */
  onFastNavigate?: (
    intent: FastLinkIntent,
    decision: FastNavigationDecision,
  ) => void;
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
    navigationPolicy: _policy,
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

// Keys TanStack Link forwards to `router.navigate()` on click.
const NAVIGATE_OPTION_KEYS = [
  'to',
  'from',
  'params',
  'search',
  'hash',
  'state',
  'mask',
  'href',
  'unsafeRelative',
  'replace',
  'resetScroll',
  'hashScrollIntoView',
  'viewTransition',
  'startTransition',
  'ignoreBlocker',
] as const;

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
  const { navigationPolicy, onFastNavigate } = options;
  return useReactFastLink<HTMLAnchorElement>({
    enabled:
      options.enabled !== false && !options.disabled && !options.reloadDocument,
    forwardedRef: options.forwardedRef ?? options.ref,
    onClickCapture: options.onClickCapture,
    navigate: (intent) => {
      const navigation: Record<string, unknown> = {};
      for (const key of NAVIGATE_OPTION_KEYS) {
        if (options[key] !== undefined) navigation[key] = options[key];
      }
      const proposed: FastRouterProposal = {
        destination: router.buildLocation(navigation as BuildOptions).href,
        method: options.replace ? 'replace' : 'push',
        scroll: options.resetScroll,
        owned: true,
      };
      runFastNavigation(intent, {
        defaultRouterDecision: { kind: 'router' },
        policy: navigationPolicy
          ? () => navigationPolicy(intent, proposed)
          : undefined,
        observe: (decision) => onFastNavigate?.(intent, decision),
        route: (decision) => {
          router.navigate({
            ...navigation,
            resetScroll: decision.scroll ?? options.resetScroll,
          });
        },
      });
    },
  });
}

/** Region-level options cannot infer routing props from ordinary anchors. */
export type FastLinkRegionProps = FastNavigationOptions & {
  children: ReactNode;
  replace?: boolean;
  resetScroll?: boolean;
};

/**
 * Applies one navigation policy to ordinary same-origin anchors.
 *
 * - Without a policy, routes owned destinations and loads others as documents.
 * - Links with their own controllers keep their options, even when disabled.
 */
export function FastLinkRegion({
  children,
  enabled,
  navigationPolicy,
  onFastNavigate,
  replace,
  resetScroll,
}: FastLinkRegionProps): JSX.Element {
  const router = useRouter();
  const attach = useReactFastLink<HTMLDivElement>({
    enabled,
    navigate: (intent) => {
      const href = intent.url.pathname + intent.url.search + intent.url.hash;
      // `router.navigate({ href })` builds through this untyped `href` path.
      const location = router.buildLocation({ href } as BuildOptions);
      const proposed: FastRouterProposal = {
        destination: location.href,
        method: replace ? 'replace' : 'push',
        scroll: resetScroll,
        owned: isOwned(router, intent.url, location),
      };
      const method = replace ? 'replace' : 'assign';
      runFastNavigation(intent, {
        defaultRouterDecision: { kind: 'router' },
        policy: navigationPolicy
          ? () => navigationPolicy(intent, proposed)
          : proposed.owned
            ? undefined
            : () => ({ kind: 'document', method }),
        observe: (decision) => onFastNavigate?.(intent, decision),
        route: (decision) => {
          router.navigate({
            href,
            replace,
            resetScroll: decision.scroll ?? resetScroll,
          });
        },
      });
    },
  });
  return (
    <div {...attach} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}

type BuildOptions = Parameters<AnyRouter['buildLocation']>[0];

type BuiltLocation = { pathname: string; publicHref: string };

/**
 * Checks that the router maps the URL back to itself and matches a route that
 * renders. Input rewrites leave foreign paths unchanged, so the output rewrite
 * moves them, for example under the basepath.
 */
function isOwned(
  router: AnyRouter,
  url: URL,
  location: BuiltLocation,
): boolean {
  const publicPath = new URL(location.publicHref, url).pathname;
  if (normalizePath(publicPath) !== normalizePath(url.pathname)) return false;
  const [, , route] = router.getMatchedRoutes(location.pathname);
  if (!route) return false;
  // TanStack Start server routes without a component are not router pages.
  return !('server' in route.options && !route.options.component);
}

function normalizePath(pathname: string): string {
  let path = pathname;
  try {
    path = decodeURI(pathname);
  } catch {
    // Keep malformed escapes as written.
  }
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

export type {
  FastLinkIntent,
  FastNavigationDecision,
  FastRouterDecision,
  FastDocumentDecision,
} from '@fast-link/core';
