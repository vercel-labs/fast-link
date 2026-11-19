'use client';

import { useEffect, useState, type JSX } from 'react';

import { record } from '../log';

/** Records document clicks by target test ID and reports hydration. */
export function ClickRecorder(): JSX.Element {
  const [isReady, setIsReady] = useState(false);
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target.closest('[data-testid]')?.getAttribute('data-testid')
          : null;
      record(
        `document-click:${target ?? 'none'}:${event.defaultPrevented ? 'prevented' : 'allowed'}`,
      );
    };
    document.addEventListener('click', onClick);
    setIsReady(true);
    return () => document.removeEventListener('click', onClick);
  }, []);
  return <output data-testid="unmount-ready" data-ready={isReady} />;
}
