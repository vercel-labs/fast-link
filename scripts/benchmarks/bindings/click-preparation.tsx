'use client';

import { createClickPreparation } from '@fast-link/core';
import {
  FastLink,
  FastLinkRegion,
  type FastLinkProps,
  type FastLinkRegionProps,
} from '@fast-link/next';
import { useClickPreparation } from '@fast-link/react';
import type { JSX, MouseEvent as ReactMouseEvent } from 'react';

// Benchmark bindings for revisions whose public API is click preparation
// without modes; release is their only Fast Link behavior. Copied over
// fixtures/next-16/app/benchmark/bindings.tsx in a comparison base checkout.

export type Mode = 'release' | 'immediate' | 'native';

export const api = 'click-preparation';

export const supportedModes: readonly Mode[] = ['release'];

function requireSupported(mode: Mode) {
  if (!supportedModes.includes(mode))
    throw new Error(`Unsupported benchmark mode: ${mode}`);
}

export function bindCore(
  anchor: HTMLAnchorElement,
  mode: Mode,
  navigate: () => void,
): () => void {
  requireSupported(mode);
  const controller = createClickPreparation<null>(anchor, {
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

export function useAnchorBinding(
  mode: Mode,
  navigate: () => void,
): {
  ref: (element: HTMLAnchorElement | null) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
} {
  requireSupported(mode);
  const binding = useClickPreparation<null, HTMLAnchorElement>({
    prepare: () => null,
  });
  return {
    ref: binding.ref,
    onClickCapture(event) {
      if (!binding.matchClick(event.nativeEvent)?.consume()) return;
      event.preventDefault();
      navigate();
    },
  };
}

export function BenchmarkFastLink({
  mode,
  ...props
}: FastLinkProps & { mode: Mode }): JSX.Element {
  requireSupported(mode);
  return <FastLink {...props} />;
}

export function BenchmarkRegion({
  mode,
  ...props
}: FastLinkRegionProps & { mode: Mode }): JSX.Element {
  requireSupported(mode);
  return <FastLinkRegion {...props} />;
}
