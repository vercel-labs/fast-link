import type { FastLinkIntent } from '@fast-link/core';

import { navigate, prepareNavigation, type Routing } from './index';

it('leaves classification until navigation when preparation is unavailable', () => {
  const router = createRouter();
  const { intent } = createIntent();
  const policy = vi.fn(() => ({ kind: 'router' as const }));
  const navigation: Routing = {
    router,
    destination: () => '/guide',
    method: 'replace',
    scroll: false,
    transitionTypes: ['slide'],
    navigationPolicy: policy,
  };

  const prepared = prepareNavigation(navigation, intent);
  expect(prepared).toBeNull();
  expect(policy).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();

  navigate(navigation, intent, prepared);
  expect(policy).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledExactlyOnceWith('/guide', {
    scroll: false,
    transitionTypes: ['slide'],
  });
});

it('does not prepare foreign routes and rechecks ownership before committing', () => {
  const handle = { push: vi.fn(), replace: vi.fn() };
  const router = {
    ...createRouter(),
    experimental_prepare: vi.fn(() => handle),
  };
  const { intent, assign } = createIntent();
  const navigation: Routing = {
    router,
    destination: () => '/guide',
    method: 'push',
    navigationPolicy: ({ anchor }) =>
      anchor.dataset.zone === 'same'
        ? { kind: 'router' }
        : { kind: 'document', method: 'assign' },
  };

  intent.anchor.dataset.zone = 'foreign';
  const foreign = prepareNavigation(navigation, intent);
  expect(foreign).toBeNull();
  expect(router.experimental_prepare).not.toHaveBeenCalled();
  navigate(navigation, intent, foreign);
  expect(assign).toHaveBeenCalledExactlyOnceWith(
    'https://example.com/docs/guide',
  );

  intent.anchor.dataset.zone = 'same';
  const prepared = prepareNavigation(navigation, intent);
  expect(router.experimental_prepare).toHaveBeenCalledExactlyOnceWith('/guide');
  intent.anchor.dataset.zone = 'foreign';
  navigate(navigation, intent, prepared);
  expect(assign.mock.calls).toEqual([
    ['https://example.com/docs/guide'],
    ['https://example.com/docs/guide'],
  ]);
  expect(handle.push).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});

it.each(['matching', 'changed router', 'changed destination'] as const)(
  'reuses only matching preparation with current commit options: %s',
  (change) => {
    const handle = { push: vi.fn(), replace: vi.fn() };
    const router = {
      ...createRouter(),
      experimental_prepare: vi.fn(() => handle),
    };
    const { intent } = createIntent();
    const navigation: Routing = {
      router,
      destination: () => '/guide',
      method: 'push',
      scroll: true,
      transitionTypes: ['original'],
    };
    const prepared = prepareNavigation(navigation, intent);
    const currentRouter = change === 'changed router' ? createRouter() : router;
    const destination = change === 'changed destination' ? '/other' : '/guide';
    const current: Routing = {
      router: currentRouter,
      destination: () => destination,
      method: 'replace',
      scroll: true,
      transitionTypes: ['updated'],
      navigationPolicy: () => ({ kind: 'router', scroll: false }),
    };

    navigate(current, intent, prepared);

    expect(router.experimental_prepare).toHaveBeenCalledExactlyOnceWith(
      '/guide',
    );
    expect(handle.push).not.toHaveBeenCalled();
    if (change === 'matching') {
      expect(handle.replace).toHaveBeenCalledExactlyOnceWith({
        scroll: false,
        transitionTypes: ['updated'],
      });
      expect(currentRouter.replace).not.toHaveBeenCalled();
    } else {
      expect(handle.replace).not.toHaveBeenCalled();
      expect(currentRouter.replace).toHaveBeenCalledExactlyOnceWith(
        destination,
        {
          scroll: false,
          transitionTypes: ['updated'],
        },
      );
    }
    expect(currentRouter.push).not.toHaveBeenCalled();
  },
);

it('never retries a failed prepared commit through router or document navigation', () => {
  const failure = new Error('commit failed');
  const handle = {
    push: vi.fn(() => {
      throw failure;
    }),
    replace: vi.fn(),
  };
  const router = {
    ...createRouter(),
    experimental_prepare: vi.fn(() => handle),
  };
  const { intent, assign } = createIntent();
  const navigation: Routing = {
    router,
    destination: () => '/guide',
    method: 'push',
  };
  const prepared = prepareNavigation(navigation, intent);

  expect(() => navigate(navigation, intent, prepared)).toThrow(failure);
  expect(handle.push).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
  expect(assign).not.toHaveBeenCalled();
});

function createRouter() {
  return {
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    bfcacheId: 'source',
  } satisfies Routing['router'];
}

function createIntent() {
  const anchor = document.createElement('a');
  const assign = vi.fn();
  Object.defineProperty(anchor, 'ownerDocument', {
    value: { defaultView: { location: { assign } } },
  });
  const intent: FastLinkIntent = {
    anchor,
    href: '/docs/guide',
    url: new URL('https://example.com/docs/guide'),
  };
  return { intent, assign };
}
