'use client';

import { useLayoutEffect, type JSX } from 'react';

export default function Page(): JSX.Element {
  useLayoutEffect(() => {
    window.benchmarkDestination = {
      text: 'Benchmark destination',
      committed: performance.now(),
    };
  }, []);
  return <p data-benchmark-destination>Benchmark destination</p>;
}
