import type { JSX } from 'react';

export const dynamic = 'force-dynamic';

export default async function Destination({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}): Promise<JSX.Element> {
  const { from } = await searchParams;
  return (
    <main>
      <h1>Contract destination</h1>
      <output data-testid="destination-from">{from}</output>
      <output data-testid="rendered-at">{Date.now()}</output>
    </main>
  );
}
