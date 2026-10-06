'use client';

import Link from 'next/link';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type RefAttributes,
} from 'react';

import type { NavigationOptions } from '../navigation-policy';
import { useFastLink } from '../use-fast-link';

type LinkProps = ComponentPropsWithoutRef<typeof Link>;

/** Next.js Link props with controls for early mouse navigation. */
export type FastLinkProps = LinkProps & NavigationOptions;

/** Starts eligible App Router navigation on primary mouse `pointerdown`. */
export const FastLink = forwardRef<HTMLAnchorElement, FastLinkProps>(
  function FastLink(
    { enabled, navigationPolicy, onFastNavigate, ...linkProps },
    forwardedRef,
  ) {
    const attach = useFastLink({
      ...linkProps,
      enabled,
      navigationPolicy,
      onFastNavigate,
      forwardedRef,
    });
    return (
      <Link
        {...linkProps}
        ref={linkProps.legacyBehavior ? forwardedRef : attach}
      />
    );
  },
) as (
  props: FastLinkProps & RefAttributes<HTMLAnchorElement>,
) => ReturnType<typeof Link>;
