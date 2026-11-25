import type { JSX } from 'react';

import { ContractLinks } from './contract-links';

export default function Contracts(): JSX.Element {
  return (
    <main>
      <h1>Contracts</h1>
      {/* Unwrapped links keep each pointer target inside its anchor box. */}
      <style>
        {
          '[data-testid="contracts-ready"] a { display: block; width: max-content; }'
        }
      </style>
      <ContractLinks />
    </main>
  );
}
