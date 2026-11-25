'use client';

import { useEffect } from 'react';

/** Marks the document once the route's client components have hydrated. */
export function HydrationMarker(): null {
  useEffect(() => {
    document.documentElement.dataset.softNavigationHydrated = 'true';
  }, []);
  return null;
}
