import type { JSX, ReactNode } from 'react';

import { ProviderLinks } from './provider-links';

// Links live in the layout so they stay mounted when the page's search changes.
export default function ProviderLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <main>
      <h1>Provider probes</h1>
      <ProviderLinks />
      {children}
    </main>
  );
}
