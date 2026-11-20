import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  useClickPreparation,
  useFastLink,
  useLinkInteraction,
} from '@fast-link/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

test('the built React hook renders on the server without DOM globals or ref attachment', () => {
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof document, 'undefined');
  const ref = { current: null as HTMLDivElement | null };
  function Region() {
    const binding = useFastLink<HTMLDivElement>({
      forwardedRef: ref,
      navigate: () => {
        throw new Error('Server rendering must not navigate');
      },
    });
    return createElement(
      'div',
      binding,
      createElement('a', { href: '/first' }, 'First'),
    );
  }
  assert.equal(
    renderToString(createElement(Region)),
    '<div><a href="/first">First</a></div>',
  );
  assert.equal(ref.current, null);
});

test('the built preparation and interaction hooks render on the server without ref attachment', () => {
  const preparationRef = { current: null as HTMLDivElement | null };
  const interactionRef = { current: null as HTMLAnchorElement | null };
  function Region() {
    const preparation = useClickPreparation<never, HTMLDivElement>({
      forwardedRef: preparationRef,
      prepare: () => {
        throw new Error('Server rendering must not prepare');
      },
    });
    const interaction = useLinkInteraction<never, HTMLAnchorElement>({
      mode: 'immediate',
      forwardedRef: interactionRef,
      navigate: () => {
        throw new Error('Server rendering must not navigate');
      },
    });
    return createElement(
      'div',
      { ref: preparation.ref },
      createElement(
        'a',
        {
          href: '/first',
          ref: interaction.ref,
          onClickCapture: interaction.suppressClick,
        },
        'First',
      ),
    );
  }
  // React 19 runs no layout effects on the server and must not warn about them.
  const logged: unknown[][] = [];
  const { error, warn } = console;
  console.error = (...args: unknown[]) => logged.push(args);
  console.warn = (...args: unknown[]) => logged.push(args);
  let html: string;
  try {
    html = renderToString(createElement(Region));
  } finally {
    console.error = error;
    console.warn = warn;
  }
  assert.equal(html, '<div><a href="/first">First</a></div>');
  assert.deepEqual(logged, []);
  assert.equal(preparationRef.current, null);
  assert.equal(interactionRef.current, null);
});
