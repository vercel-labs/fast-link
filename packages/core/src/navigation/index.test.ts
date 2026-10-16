/*
 * Tests router/document decisions, policy fallback, observer failures, and error
 * precedence. Navigation methods are mocked to isolate the decision contract
 * from browser routing.
 */

import type { FastLinkIntent } from '../interaction';
import { runFastNavigation, type FastNavigationDecision } from './index';

function navigation() {
  const assign = vi.fn();
  const replace = vi.fn();
  const anchor = document.createElement('a');
  Object.defineProperty(anchor, 'ownerDocument', {
    value: { defaultView: { location: { assign, replace } } },
  });
  const intent: FastLinkIntent = {
    anchor,
    href: '/docs/guide',
    url: new URL('https://example.com/docs/guide'),
  };
  return { intent, assign, replace };
}

it('uses the explicit default only when policy is absent, then observes and routes', () => {
  const { intent, assign } = navigation();
  const order: string[] = [];
  runFastNavigation(intent, {
    defaultRouterDecision: { kind: 'router', scroll: false },
    observe: (decision) => order.push(`observe:${decision.kind}`),
    route: (decision) => order.push(`route:${decision.scroll}`),
  });
  expect(order).toEqual(['observe:router', 'route:false']);
  expect(assign).not.toHaveBeenCalled();
});

it.each(['router', 'document'] as const)(
  'rejects a Promise disguised as an object decision: %s',
  (kind) => {
    class TaggedPromise extends Promise<void> {}
    Object.defineProperty(TaggedPromise.prototype, Symbol.toStringTag, {
      value: 'Object',
    });
    const value = Object.assign(
      new TaggedPromise((resolve) => resolve()),
      kind === 'router' ? { kind } : { kind, method: 'replace' as const },
    );
    const { intent, assign, replace } = navigation();
    const observe = vi.fn();
    const route = vi.fn();

    expect(() =>
      runFastNavigation(intent, {
        defaultRouterDecision: { kind: 'router' },
        policy: () => value,
        observe,
        route,
      }),
    ).toThrow(TypeError);
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/docs/guide',
    );
    expect(replace).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    expect(route).not.toHaveBeenCalled();
  },
);

it.each([
  ['router', { kind: 'router' }, 'router'],
  ['scroll override', { kind: 'router', scroll: false }, 'router'],
  ['assign', { kind: 'document', method: 'assign' }, 'assign'],
  ['replace', { kind: 'document', method: 'replace' }, 'replace'],
  ['null', null, 'invalid'],
  ['undefined', undefined, 'invalid'],
  ['promise', Promise.resolve({ kind: 'router' }), 'invalid'],
  [
    'promise with decision fields',
    Object.assign(Promise.resolve(), { kind: 'router' }),
    'invalid',
  ],
  ['unknown kind', { kind: 'native' }, 'invalid'],
  ['non-boolean scroll', { kind: 'router', scroll: null }, 'invalid'],
  ['invalid document method', { kind: 'document', method: 'push' }, 'invalid'],
] as const)('selects or rejects a present policy: %s', (_, value, action) => {
  const { intent, assign, replace } = navigation();
  const observe = vi.fn();
  const route = vi.fn();
  const policy = vi.fn(() => value as FastNavigationDecision);
  const run = () =>
    runFastNavigation(intent, {
      defaultRouterDecision: { kind: 'router' },
      policy,
      observe,
      route,
    });
  if (action === 'invalid') expect(run).toThrow(TypeError);
  else run();
  expect(policy).toHaveBeenCalledTimes(1);
  expect(observe).toHaveBeenCalledTimes(action === 'invalid' ? 0 : 1);
  expect(route).toHaveBeenCalledTimes(action === 'router' ? 1 : 0);
  expect(assign).toHaveBeenCalledTimes(
    ['assign', 'invalid'].includes(action) ? 1 : 0,
  );
  expect(replace).toHaveBeenCalledTimes(action === 'replace' ? 1 : 0);
  if (action !== 'router')
    expect(action === 'replace' ? replace : assign).toHaveBeenCalledWith(
      'https://example.com/docs/guide',
    );
});

it.each([
  [
    'router',
    {
      kind: 'router',
      scroll: false,
      destination: '/elsewhere',
      method: 'replace',
      source: 'sidebar',
    },
    { kind: 'router', scroll: false },
  ],
  [
    'document',
    {
      kind: 'document',
      method: 'replace',
      destination: '/elsewhere',
      scroll: false,
      source: 'sidebar',
    },
    { kind: 'document', method: 'replace' },
  ],
] as const)('ignores extra fields on a %s decision', (_, value, decision) => {
  const { intent, assign, replace } = navigation();
  const observe = vi.fn();
  const route = vi.fn();
  runFastNavigation(intent, {
    defaultRouterDecision: { kind: 'router' },
    policy: () => value,
    observe,
    route,
  });
  expect(observe).toHaveBeenCalledExactlyOnceWith(decision);
  expect(Object.isFrozen(observe.mock.calls[0]?.[0])).toBe(true);
  expect(assign).not.toHaveBeenCalled();
  if (decision.kind === 'router') {
    expect(route).toHaveBeenCalledExactlyOnceWith(decision);
    expect(replace).not.toHaveBeenCalled();
  } else {
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/docs/guide',
    );
    expect(route).not.toHaveBeenCalled();
  }
});

it.each([undefined, false, true])(
  'preserves an optional scroll value: %s',
  (scroll) => {
    const { intent } = navigation();
    const route = vi.fn();
    runFastNavigation(intent, {
      defaultRouterDecision: { kind: 'router', scroll: true },
      policy: () => ({ kind: 'router', scroll }),
      route,
    });
    expect(route).toHaveBeenCalledExactlyOnceWith(
      scroll === undefined ? { kind: 'router' } : { kind: 'router', scroll },
    );
  },
);

it.each(['assign', 'replace'] as const)(
  'captures the validated URL before policy and observer for %s',
  (method) => {
    const { intent, assign, replace } = navigation();
    const order: string[] = [];
    const action = method === 'assign' ? assign : replace;
    action.mockImplementation(() => order.push('document'));
    runFastNavigation(intent, {
      defaultRouterDecision: { kind: 'router' },
      policy: () => {
        order.push('policy');
        intent.url.pathname = '/policy-change';
        return { kind: 'document', method };
      },
      observe: () => {
        order.push('observe');
        intent.url.pathname = '/observer-change';
      },
      route: () => {
        throw new Error('Unexpected router action');
      },
    });
    expect(order).toEqual(['policy', 'observe', 'document']);
    expect(action).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/docs/guide',
    );
  },
);

it('falls back to the captured URL and surfaces a thrown policy error', () => {
  const { intent, assign } = navigation();
  const error = new Error('policy failed');
  const observe = vi.fn();
  const route = vi.fn();
  expect(() =>
    runFastNavigation(intent, {
      defaultRouterDecision: { kind: 'router' },
      policy: () => {
        intent.url.pathname = '/changed';
        throw error;
      },
      observe,
      route,
    }),
  ).toThrow(error);
  expect(assign).toHaveBeenCalledExactlyOnceWith(
    'https://example.com/docs/guide',
  );
  expect(observe).not.toHaveBeenCalled();
  expect(route).not.toHaveBeenCalled();
});

it.each(['router', 'assign', 'replace'] as const)(
  'executes %s even when observation throws',
  (action) => {
    const { intent, assign, replace } = navigation();
    const route = vi.fn();
    const error = new Error('observer failed');
    expect(() =>
      runFastNavigation(intent, {
        defaultRouterDecision: { kind: 'router' },
        policy: () =>
          action === 'router'
            ? { kind: 'router' }
            : { kind: 'document', method: action },
        observe: () => {
          throw error;
        },
        route,
      }),
    ).toThrow(error);
    expect(
      action === 'router' ? route : action === 'assign' ? assign : replace,
    ).toHaveBeenCalledTimes(1);
  },
);

it('surfaces router errors without document fallback', () => {
  const { intent, assign, replace } = navigation();
  const error = new Error('router failed');
  expect(() =>
    runFastNavigation(intent, {
      defaultRouterDecision: { kind: 'router' },
      route: () => {
        throw error;
      },
    }),
  ).toThrow(error);
  expect(assign).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
});

it('keeps the decision unchanged when an observer tries to rewrite it', () => {
  const { intent, assign } = navigation();
  const route = vi.fn();
  runFastNavigation(intent, {
    defaultRouterDecision: { kind: 'router' },
    observe: (decision) => {
      Reflect.set(decision, 'kind', 'document');
    },
    route,
  });
  expect(route).toHaveBeenCalledExactlyOnceWith({ kind: 'router' });
  expect(assign).not.toHaveBeenCalled();
});

it('surfaces the fallback error if policy and fallback fail', () => {
  const { intent, assign } = navigation();
  const policyError = new Error('policy failed');
  const documentError = new Error('document failed');
  assign.mockImplementation(() => {
    throw documentError;
  });
  let caught;
  try {
    runFastNavigation(intent, {
      defaultRouterDecision: { kind: 'router' },
      policy: () => {
        throw policyError;
      },
      route: vi.fn(),
    });
  } catch (error) {
    caught = error;
  }
  expect(caught).toBe(documentError);
});

it.each(['router', 'assign', 'replace'] as const)(
  'surfaces the %s error if observation and navigation fail',
  (action) => {
    const { intent, assign, replace } = navigation();
    const observerError = new Error('observer failed');
    const navigationError = new Error('navigation failed');
    const route = vi.fn();
    const navigate =
      action === 'router' ? route : action === 'assign' ? assign : replace;
    navigate.mockImplementation(() => {
      throw navigationError;
    });
    let caught;
    try {
      runFastNavigation(intent, {
        defaultRouterDecision: { kind: 'router' },
        policy: () =>
          action === 'router'
            ? { kind: 'router' }
            : { kind: 'document', method: action },
        observe: () => {
          throw observerError;
        },
        route,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(navigationError);
    expect(route).toHaveBeenCalledTimes(action === 'router' ? 1 : 0);
    expect(assign).toHaveBeenCalledTimes(action === 'assign' ? 1 : 0);
    expect(replace).toHaveBeenCalledTimes(action === 'replace' ? 1 : 0);
  },
);
