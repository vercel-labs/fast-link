import type { JSX } from 'react';

import { PrefetchLinks } from './prefetch-links';

export default function Prefetch(): JSX.Element {
  return (
    <main>
      <h1>Prefetch contracts</h1>
      <PrefetchLinks />
    </main>
  );
}
