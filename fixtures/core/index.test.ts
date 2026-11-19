/*
 * Exercises the built core package through its public import in plain Node.js.
 * Router decisions, document navigation, policy fallback, and decision
 * validation must work without React or browser globals. Importing the package
 * also loads the DOM controllers, which must not touch browser globals at load.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  runFastNavigation,
  validateFastNavigationDecision,
  type FastLinkIntent,
  type FastNavigationDecision,
} from '@fast-link/core';

test('the public core runner needs no framework or browser global', () => {
  const order: string[] = [];
  const intent: FastLinkIntent = {
    anchor: {
      ownerDocument: {
        defaultView: {
          location: {
            assign: (url: string) => order.push(`assign:${url}`),
            replace: (url: string) => order.push(`replace:${url}`),
          },
        },
      },
    } as unknown as HTMLAnchorElement,
    href: '/guide',
    url: new URL('https://example.com/guide'),
  };
  const options = {
    defaultRouterDecision: { kind: 'router' as const },
    observe: (decision: FastNavigationDecision) =>
      order.push(`observe:${decision.kind}`),
    route: () => {
      order.push('route');
    },
  };
  runFastNavigation(intent, options);
  assert.deepEqual(order.splice(0), ['observe:router', 'route']);
  runFastNavigation(intent, {
    ...options,
    policy: () => ({ kind: 'document', method: 'replace' }),
  });
  assert.deepEqual(order.splice(0), [
    'observe:document',
    'replace:https://example.com/guide',
  ]);
  const error = new Error('policy failed');
  assert.throws(
    () =>
      runFastNavigation(intent, {
        ...options,
        policy: () => {
          throw error;
        },
      }),
    error,
  );
  assert.deepEqual(order, ['assign:https://example.com/guide']);
});

test('the public decision validator copies supported decisions without navigating', () => {
  const decision = validateFastNavigationDecision({
    kind: 'document',
    method: 'replace',
    extra: true,
  });
  assert.deepEqual(decision, { kind: 'document', method: 'replace' });
  assert.ok(Object.isFrozen(decision));
  assert.throws(
    () => validateFastNavigationDecision({ kind: 'router', scroll: 'yes' }),
    TypeError,
  );
});
