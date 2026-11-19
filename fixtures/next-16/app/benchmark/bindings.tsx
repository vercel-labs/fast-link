'use client';

import { createLinkInteraction } from '@fast-link/core';
import {
  FastLink,
  FastLinkRegion,
  type FastLinkProps,
  type FastLinkRegionProps,
} from '@fast-link/next';
import { useLinkInteraction } from '@fast-link/react';
import type { JSX, MouseEvent as ReactMouseEvent } from 'react';

// The only benchmark module that calls Fast Link APIs. Revision comparisons
// replace it with a compatible copy from scripts/benchmarks/bindings/.

export type Mode = 'release' | 'immediate' | 'native';

/** Identifies the public API these bindings exercise. */
export const api = 'link-interaction';

/** Modes this revision's public API can select. */
export const supportedModes: readonly Mode[] = [
  'release',
  'immediate',
  'native',
];

/**
 * Binds a DOM anchor so `navigate` runs once per accepted press/click pair and
 * the accepted click is prevented. Native mode leaves the click alone.
 * Returns cleanup.
 */
export function bindCore(
  anchor: HTMLAnchorElement,
  mode: Mode,
  navigate: () => void,
): () => void {
  if (mode !== 'release') {
    const controller = createLinkInteraction(
      anchor,
      mode === 'immediate' ? { mode, navigate } : { mode },
    );
    return () => controller.destroy();
  }
  const controller = createLinkInteraction<null>(anchor, {
    mode,
    prepare: () => null,
  });
  const accept = (event: MouseEvent) => {
    if (!controller.matchClick(event)?.consume()) return;
    event.preventDefault();
    navigate();
  };
  anchor.addEventListener('click', accept);
  return () => {
    anchor.removeEventListener('click', accept);
    controller.destroy();
  };
}

/** React anchor bindings with the same accepted-click contract as `bindCore`. */
export function useAnchorBinding(
  mode: Mode,
  navigate: () => void,
): {
  ref: (element: HTMLAnchorElement | null) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
} {
  const binding = useLinkInteraction<null, HTMLAnchorElement>(
    mode === 'release'
      ? { mode, prepare: () => null }
      : mode === 'immediate'
        ? { mode, navigate }
        : { mode },
  );
  return {
    ref: binding.ref,
    onClickCapture(event) {
      binding.suppressClick(event);
      if (!binding.matchClick(event.nativeEvent)?.consume()) return;
      event.preventDefault();
      navigate();
    },
  };
}

export function BenchmarkFastLink(
  props: FastLinkProps & { mode: Mode },
): JSX.Element {
  return <FastLink {...props} />;
}

export function BenchmarkRegion(
  props: FastLinkRegionProps & { mode: Mode },
): JSX.Element {
  return <FastLinkRegion {...props} />;
}
