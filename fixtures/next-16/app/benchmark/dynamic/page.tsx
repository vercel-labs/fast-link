import { connection } from 'next/server';
import type { JSX } from 'react';

import { DestinationCommit } from '../target/destination-commit';

// Fixed server work per request; docs/benchmarks.md states this value.
const SERVER_DELAY_MS = 150;

/** Renders per request after fixed server work, so a prefetch carries no page data. */
export default async function Page(): Promise<JSX.Element> {
  await connection();
  await new Promise((done) => setTimeout(done, SERVER_DELAY_MS));
  return (
    <DestinationCommit>
      <p data-benchmark-destination>Benchmark destination</p>
    </DestinationCommit>
  );
}
