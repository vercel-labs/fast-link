'use client';

import { useLayoutEffect, type ReactNode } from 'react';

/** Records destination commit while keeping its content visible in prefetch responses. */
export function DestinationCommit({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  useLayoutEffect(() => {
    window.benchmarkDestination = {
      text: 'Benchmark destination',
      committed: performance.now(),
    };
  }, []);
  return children;
}
