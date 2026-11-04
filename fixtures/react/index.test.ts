import assert from 'node:assert/strict';
import { test } from 'node:test';

import { useClickPreparation } from '@fast-link/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';

test('the built React hook renders on the server without DOM globals or ref attachment', () => {
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof document, 'undefined');
  const ref = { current: null as HTMLDivElement | null };
  function Region() {
    const binding = useClickPreparation<never, HTMLDivElement>({
      forwardedRef: ref,
      prepare: () => {
        throw new Error('Server rendering must not navigate');
      },
    });
    return createElement(
      'div',
      { ref: binding.ref },
      createElement('a', { href: '/first' }, 'First'),
    );
  }
  assert.equal(
    renderToString(createElement(Region)),
    '<div><a href="/first">First</a></div>',
  );
  assert.equal(ref.current, null);
});
