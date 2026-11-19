import Link from 'next/link';
import type { JSX } from 'react';

import { box } from '../box';
import { ClickRecorder } from '../click-recorder';

export default function Landing(): JSX.Element {
  return (
    <main>
      <h1>Unmount landing</h1>
      <ClickRecorder />
      {[0, 1].map((index) => (
        <Link
          key={index}
          href={`/contracts/destination?from=landing-${index}`}
          data-testid={`landing-${index}`}
          prefetch={false}
          style={box(index)}
        >
          Landing link {index}
        </Link>
      ))}
    </main>
  );
}
