'use client';

import { createFastLink } from '@fast-link/core';
import {
  FastLink,
  FastLinkRegion,
  type FastLinkProps,
  type FastLinkRegionProps,
} from '@fast-link/next';
import { useFastLink } from '@fast-link/react';
import type { JSX, MouseEvent as ReactMouseEvent } from 'react';

// Benchmark bindings for revisions whose public API is `createFastLink`,
// which navigates on press; immediate is their only Fast Link behavior.
// Copied over fixtures/next-16/app/benchmark/bindings.tsx in a comparison base
// checkout.

export type Mode = 'release' | 'immediate' | 'native';

export const api = 'fast-link';

export const supportedModes: readonly Mode[] = ['immediate'];

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
  const controller = createFastLink(anchor, { navigate });
  return () => controller.destroy();
}

export function useAnchorBinding(
  mode: Mode,
  navigate: () => void,
): {
  ref: (element: HTMLAnchorElement | null) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLAnchorElement>) => void;
} {
  requireSupported(mode);
  return useFastLink<HTMLAnchorElement>({ navigate });
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
