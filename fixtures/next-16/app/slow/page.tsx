import type { JSX } from 'react';

export const dynamic = 'force-dynamic';

export default async function Slow(): Promise<JSX.Element> {
  await new Promise((resolve) => setTimeout(resolve, 750));
  return (
    <main>
      <h1>Slow destination</h1>
    </main>
  );
}
