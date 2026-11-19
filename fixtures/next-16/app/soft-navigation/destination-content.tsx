import type { JSX } from 'react';

/** Destination content shared by every soft-navigation scenario. */
export function DestinationContent(): JSX.Element {
  return (
    <main data-soft-navigation-destination>
      <h1>Soft navigation destination</h1>
      <p>Destination content rendered by the App Router.</p>
    </main>
  );
}
