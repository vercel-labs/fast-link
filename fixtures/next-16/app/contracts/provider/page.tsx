import type { JSX } from 'react';

export const dynamic = 'force-dynamic';

export default async function ProviderStep({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}): Promise<JSX.Element> {
  const { step = 'start' } = await searchParams;
  return <output data-testid="provider-step">{step}</output>;
}
