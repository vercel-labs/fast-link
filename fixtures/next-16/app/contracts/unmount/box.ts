import type { CSSProperties } from 'react';

/** Places sources and landing links at the same viewport position. */
export function box(index: number): CSSProperties {
  return {
    position: 'fixed',
    top: 100 + index * 120,
    left: 100,
    width: 240,
    height: 80,
    display: 'block',
  };
}
