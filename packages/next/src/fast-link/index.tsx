'use client';

import type { PreparedClick } from '@fast-link/core';
import { useClickPreparation } from '@fast-link/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type RefAttributes,
} from 'react';

import { getLinkDestination } from '../link-destination';
import type { NavigationOptions } from '../navigation-policy';
import {
  createPreparedNavigation,
  type PreparedNavigation,
} from '../prepared-navigation';

type LinkProps = ComponentPropsWithoutRef<typeof Link>;

/** Next.js Link props with controls for preparation and accepted-click navigation. */
export type FastLinkProps = LinkProps & NavigationOptions;

/** Prepares on eligible mouse press and navigates after Next Link's click guards pass. */
export const FastLink = forwardRef<HTMLAnchorElement, FastLinkProps>(
  function FastLink(
    { enabled, navigationPolicy, onFastNavigate, ...linkProps },
    forwardedRef,
  ) {
    const router = useRouter();
    const navigation = createPreparedNavigation(router, {
      navigationPolicy,
      onFastNavigate,
      destination: (intent) => getLinkDestination(linkProps.href, intent.url),
      method: linkProps.replace ? 'replace' : 'push',
      scroll: linkProps.scroll,
      transitionTypes: linkProps.transitionTypes,
    });
    const committed = useRef({
      navigation,
      onClick: linkProps.onClick,
      onNavigate: linkProps.onNavigate,
    });
    // Publish before ref callbacks; guards may synchronously commit new props.
    useLayoutEffect(() => {
      committed.current = {
        navigation,
        onClick: linkProps.onClick,
        onNavigate: linkProps.onNavigate,
      };
    });
    const attach = useClickPreparation<PreparedNavigation, HTMLAnchorElement>({
      enabled:
        enabled !== false &&
        linkProps.as === undefined &&
        !linkProps.legacyBehavior,
      prepare: navigation.prepare,
      forwardedRef,
    });
    const active = useRef<PreparedClick<PreparedNavigation> | null>(null);
    return (
      <Link
        {...linkProps}
        ref={linkProps.legacyBehavior ? forwardedRef : attach.ref}
        onClick={(event) => {
          active.current?.discard();
          active.current = null;
          const candidate = attach.matchClick(event.nativeEvent);
          try {
            committed.current.onClick?.(event);
          } catch (error) {
            candidate?.discard();
            throw error;
          }
          if (event.defaultPrevented) {
            candidate?.discard();
            return;
          }
          active.current = candidate;
          // Next calls onNavigate synchronously. Native paths may never call it.
          if (candidate)
            queueMicrotask(() => {
              if (active.current === candidate) {
                candidate.discard();
                active.current = null;
              }
            });
        }}
        onNavigate={(event) => {
          const candidate = active.current;
          active.current = null;
          let canceled = false;
          try {
            committed.current.onNavigate?.({
              preventDefault() {
                canceled = true;
                event.preventDefault();
              },
            });
            if (canceled) return;
            const activation = candidate?.consume();
            if (!activation) return;
            event.preventDefault();
            committed.current.navigation.navigate(activation);
          } finally {
            candidate?.discard();
          }
        }}
      />
    );
  },
) as (
  props: FastLinkProps & RefAttributes<HTMLAnchorElement>,
) => ReturnType<typeof Link>;
