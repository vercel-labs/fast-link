import { FastLink, FastLinkRegion } from '@fast-link/next';
import Link from 'next/link';
import type { JSX } from 'react';

import { ClientLinks } from './client-links';
import { PolicyLinks } from './policy-links';

export default function Home(): JSX.Element {
  return (
    <main>
      <h1>Home</h1>
      <FastLink
        href="/fast?from=home#destination"
        data-testid="fast"
        prefetch={false}
      >
        Fast
      </FastLink>
      <FastLink
        href={{ pathname: '/object', query: { ref: 'a b' } }}
        data-testid="object"
        prefetch={false}
      >
        Object
      </FastLink>
      <FastLinkRegion basePath="/docs">
        <nav aria-label="Region navigation">
          <Link
            href="/fast?from=region#destination"
            data-testid="region-fast"
            prefetch={false}
          >
            Region fast
          </Link>
          <Link
            href="/fast?from=keyboard"
            data-testid="region-native"
            prefetch={false}
          >
            Region native
          </Link>
        </nav>
      </FastLinkRegion>
      <ClientLinks />
      <PolicyLinks />
    </main>
  );
}
