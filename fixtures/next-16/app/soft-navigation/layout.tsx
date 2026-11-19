import type { JSX, ReactNode } from 'react';

import { HydrationMarker } from './hydration-marker';

export default function Layout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <>
      <HydrationMarker />
      {children}
    </>
  );
}
