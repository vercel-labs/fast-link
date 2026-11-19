'use client';

import type { PreparedClick } from '@fast-link/core';
import type { LinkInteractionBinding } from '@fast-link/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useState,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type RefAttributes,
  type RefObject,
} from 'react';

import { getLinkDestination } from '../link-destination';
import { navigate, type PreparedNavigation } from '../navigation';
import type { NavigationOptions } from '../navigation-policy';
import {
  runNavigationGuard,
  useNavigationInteraction,
  type CommittedNavigation,
} from '../use-navigation-interaction';

type LinkProps = ComponentPropsWithoutRef<typeof Link>;

/** Next.js Link props with a navigation mode, policy, and observer. */
export type FastLinkProps = Omit<LinkProps, 'as' | 'legacyBehavior'> &
  NavigationOptions;

type CommittedLink = CommittedNavigation &
  Pick<LinkProps, 'onClick' | 'onClickCapture'>;

/**
 * Next.js Link with early mouse navigation in the selected `mode`.
 *
 * - `release` (default) prepares on press and navigates after the caller's
 *   `onClick`, Next Link's checks, and the caller's `onNavigate`.
 * - `immediate` runs `onNavigate`, then navigates on press. The follow-up
 *   click stays prevented even if `onNavigate` cancels or throws; click
 *   handlers still run if the link is still mounted.
 * - `native` leaves navigation to Next Link.
 *
 * Keeps its own mode and options inside every `FastLinkRegion`.
 */
export function FastLink({
  ref: forwardedRef,
  mode,
  navigationPolicy,
  onFastNavigate,
  ...linkProps
}: FastLinkProps & RefAttributes<HTMLAnchorElement>): ReturnType<typeof Link> {
  const router = useRouter();
  const { binding, committed } = useNavigationInteraction<
    CommittedLink,
    HTMLAnchorElement
  >(
    mode,
    {
      routing: {
        router,
        navigationPolicy,
        onFastNavigate,
        destination: (intent) => getLinkDestination(linkProps.href, intent.url),
        method: linkProps.replace ? 'replace' : 'push',
        scroll: linkProps.scroll,
        transitionTypes: linkProps.transitionTypes,
      },
      onClick: linkProps.onClick,
      onClickCapture: linkProps.onClickCapture,
      onNavigate: linkProps.onNavigate,
    },
    forwardedRef,
  );
  const [handlers] = useState(() => createLinkHandlers(binding, committed));
  return <Link {...linkProps} ref={binding.ref} {...handlers} />;
}

/**
 * Accepts a release click in Next Link's `onNavigate`, after the caller's
 * `onClick` and Next's own checks. A candidate that Next never reaches is
 * discarded in a microtask.
 */
function createLinkHandlers(
  binding: LinkInteractionBinding<PreparedNavigation, HTMLAnchorElement>,
  committed: RefObject<CommittedLink>,
) {
  let active: PreparedClick<PreparedNavigation> | null = null;

  return {
    onClickCapture(event: MouseEvent<HTMLAnchorElement>) {
      binding.suppressClick(event);
      committed.current.onClickCapture?.(event);
    },
    onClick(event: MouseEvent<HTMLAnchorElement>) {
      active?.discard();
      active = null;
      const candidate = binding.matchClick(event.nativeEvent);
      try {
        committed.current.onClick?.(event);
      } catch (error) {
        candidate?.discard();
        throw error;
      }
      if (!candidate) return;
      if (event.defaultPrevented) {
        candidate.discard();
        return;
      }
      active = candidate;
      // Next calls onNavigate synchronously. Native paths may never call it.
      queueMicrotask(() => {
        if (active !== candidate) return;
        candidate.discard();
        active = null;
      });
    },
    onNavigate(event: { preventDefault(): void }) {
      const candidate = active;
      active = null;
      try {
        if (!runNavigationGuard(committed.current.onNavigate)) {
          event.preventDefault();
          return;
        }
        const activation = candidate?.consume();
        if (!activation) return;
        event.preventDefault();
        navigate(
          committed.current.routing,
          activation.intent,
          activation.prepared,
        );
      } finally {
        candidate?.discard();
      }
    },
  };
}
