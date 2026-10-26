import assert from 'node:assert/strict';
import { test } from 'node:test';

import { useFastLink } from '@fast-link/react';
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
