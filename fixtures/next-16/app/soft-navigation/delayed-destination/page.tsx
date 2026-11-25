import type { JSX } from 'react';

import { DestinationContent } from '../destination-content';

export const dynamic = 'force-dynamic';

// Outlasts the probe's mouse hold, so release happens while the route is pending.
export default async function DelayedDestination(): Promise<JSX.Element> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return <DestinationContent />;
}
