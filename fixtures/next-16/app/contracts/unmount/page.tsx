import { FastLink, FastLinkRegion } from '@fast-link/next';
import Link from 'next/link';
import type { JSX } from 'react';

import { box } from './box';
import { ClickRecorder } from './click-recorder';

// Immediate sources commit before release, so the follow-up lands on the landing page.
export default function Unmount(): JSX.Element {
  return (
    <main>
      <h1>Unmount source</h1>
      <ClickRecorder />
      <FastLink
        href="/contracts/unmount/landing?from=link"
        mode="immediate"
        data-testid="unmount-link"
        style={box(0)}
      >
        Immediate link
      </FastLink>
      <FastLinkRegion basePath="/docs" mode="immediate">
        <Link
          href="/contracts/unmount/landing?from=region"
          data-testid="unmount-region"
          style={box(1)}
        >
          Immediate region link
        </Link>
      </FastLinkRegion>
    </main>
  );
}
