import type { JSX } from 'react';

export default function Fast(): JSX.Element {
  return (
    <main>
      <h1>Fast destination</h1>
      <p id="destination">Destination</p>
      <div style={{ height: 6000 }} />
    </main>
  );
}
