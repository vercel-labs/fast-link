/*
 * Type-only checks for removed props and core mode options, compiled by the
 * fixture's typecheck against the built packages. Nothing renders this file.
 */

import { createLinkInteraction } from '@fast-link/core';
import { FastLink, FastLinkRegion, useFastLink } from '@fast-link/next';
import type { JSX } from 'react';

export function RemovedProps(): JSX.Element {
  useFastLink({
    href: '/',
    // @ts-expect-error `mode` replaced `enabled`.
    enabled: false,
  });
  useFastLink({
    href: '/',
    // @ts-expect-error `as` was removed.
    as: '/alias',
  });
  useFastLink({
    href: '/',
    // @ts-expect-error `legacyBehavior` was removed.
    legacyBehavior: true,
  });
  return (
    <>
      <FastLink
        href="/"
        // @ts-expect-error `mode` replaced `enabled`.
        enabled={false}
      />
      <FastLink
        href="/"
        // @ts-expect-error `as` was removed.
        as="/alias"
      />
      <FastLink
        href="/"
        // @ts-expect-error `legacyBehavior` was removed.
        legacyBehavior
      />
      <FastLinkRegion
        // @ts-expect-error `mode` replaced `enabled`.
        enabled={false}
      >
        {null}
      </FastLinkRegion>
      <FastLinkRegion
        // @ts-expect-error Regions have no `as`.
        as="/alias"
      >
        {null}
      </FastLinkRegion>
      <FastLinkRegion
        // @ts-expect-error Regions have no `legacyBehavior`.
        legacyBehavior
      >
        {null}
      </FastLinkRegion>
    </>
  );
}

export function checkCoreModeOptions(root: HTMLElement): void {
  // @ts-expect-error Release mode requires `prepare`.
  createLinkInteraction(root, { mode: 'release' });
  // @ts-expect-error Immediate mode requires `navigate`.
  createLinkInteraction(root, { mode: 'immediate' });
  createLinkInteraction(root, {
    mode: 'native',
    // @ts-expect-error Native mode accepts no callbacks.
    navigate: () => undefined,
  });
  createLinkInteraction(root, {
    mode: 'native',
    // @ts-expect-error Native mode accepts no callbacks.
    prepare: () => null,
  });
}
