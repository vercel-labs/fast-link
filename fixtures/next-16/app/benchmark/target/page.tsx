import type { JSX } from 'react';

import { DestinationCommit } from './destination-commit';

/** Exposes destination content in prefetch responses for the runner's readiness check. */
export default function Page(): JSX.Element {
  return (
    <DestinationCommit>
      <p data-benchmark-destination>Benchmark destination</p>
    </DestinationCommit>
  );
}
