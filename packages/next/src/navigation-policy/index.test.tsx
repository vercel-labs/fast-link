import { render } from '@testing-library/react';

import { FastLink } from '../fast-link';
import { FastLinkRegion } from '../fast-link-region';
import { HookLink, pointerDown, router, captureErrors } from '../testing';
import type { FastNavigationPolicy } from './index';

describe('navigation policy', () => {
  it('lets a managed Link own its proposal inside a Region and override only scroll', () => {
    const regionPolicy = vi.fn();
    const order: string[] = [];
    const policy: FastNavigationPolicy = (intent, proposed) => {
      order.push('policy');
      expect(intent.href).toBe('/docs/pricing');
      expect(proposed).toEqual({
        destination: '/pricing',
        method: 'replace',
        scroll: true,
      });
      Reflect.set(proposed, 'destination', '/changed');
      Reflect.set(proposed, 'method', 'push');
      return {
        kind: 'router',
        scroll: false,
        destination: '/ignored',
        method: 'push',
      };
    };
    const { getByRole } = render(
      <FastLinkRegion navigationPolicy={regionPolicy}>
        <FastLink
          href="/pricing"
          replace
          scroll
          transitionTypes={['slide']}
          navigationPolicy={policy}
          onNavigate={() => order.push('navigate')}
          onFastNavigate={(_, decision) =>
            order.push(`observe:${decision.kind}`)
          }
        >
          Pricing
        </FastLink>
      </FastLinkRegion>,
    );
    pointerDown(getByRole('link'));
    expect(order).toEqual(['navigate', 'policy', 'observe:router']);
    expect(regionPolicy).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/pricing', {
      scroll: false,
      transitionTypes: ['slide'],
    });
    expect(router.push).not.toHaveBeenCalled();
  });
});

it.each([{ enabled: false }, { as: '/display' }, { 'data-no-fast-link': '' }])(
  'keeps a native managed Link inside a Region native: %o',
  (options) => {
    const policy = vi.fn();
    const { getByRole } = render(
      <FastLinkRegion navigationPolicy={policy}>
        <FastLink href="/pricing" {...options}>
          Pricing
        </FastLink>
      </FastLinkRegion>,
    );
    pointerDown(getByRole('link'));
    expect(router.push).not.toHaveBeenCalled();
    expect(policy).not.toHaveBeenCalled();
  },
);

it.each([undefined, false, true])(
  'applies Region scroll only when supplied: %s',
  (scroll) => {
    const policy: FastNavigationPolicy = (intent, proposed) => {
      expect(intent.url.href).toBe(
        'https://example.com/docs/docs/guide?q=yes#read',
      );
      expect(proposed).toEqual({
        destination: '/docs/guide?q=yes#read',
        method: 'push',
      });
      Reflect.set(proposed, 'destination', '/changed');
      return { kind: 'router', scroll };
    };
    const { getByRole } = render(
      <FastLinkRegion basePath="/docs" navigationPolicy={policy}>
        <a href="/docs/docs/guide?q=yes#read">Guide</a>
      </FastLinkRegion>,
    );
    pointerDown(getByRole('link'));
    expect(router.push.mock.calls).toEqual([
      scroll === undefined
        ? ['/docs/guide?q=yes#read']
        : ['/docs/guide?q=yes#read', { scroll }],
    ]);
  },
);

it.each([undefined, false, true])(
  'retains Link history and transitions with policy scroll=%s',
  (scroll) => {
    const { getByRole } = render(
      <FastLink
        href={{ pathname: '/guide', query: { ref: 'a b' }, hash: 'read' }}
        replace
        scroll={false}
        transitionTypes={['slide']}
        navigationPolicy={() => ({ kind: 'router', scroll })}
      >
        Guide
      </FastLink>,
    );
    pointerDown(getByRole('link'));
    expect(router.replace).toHaveBeenCalledExactlyOnceWith(
      '/guide?ref=a+b#read',
      { scroll: scroll ?? false, transitionTypes: ['slide'] },
    );
  },
);

it.each(['link', 'region', 'hook'] as const)(
  'runs document policy and failure fallback through %s',
  (binding) => {
    const assign = vi.fn();
    const replace = vi.fn();
    const observe = vi.fn();
    const failure = new Error('policy failed');
    let fail = false;
    const policy: FastNavigationPolicy = (intent) => {
      intent.url.pathname = '/changed';
      if (fail) throw failure;
      return { kind: 'document', method: 'replace' };
    };
    const options = { navigationPolicy: policy, onFastNavigate: observe };
    const { getByRole } = render(
      binding === 'link' ? (
        <FastLink href="/guide" {...options}>
          Guide
        </FastLink>
      ) : binding === 'hook' ? (
        <HookLink href="/guide" {...options} />
      ) : (
        <FastLinkRegion basePath="/docs" {...options}>
          <a href="/docs/guide">Guide</a>
        </FastLinkRegion>
      ),
    );
    const anchor = getByRole('link');
    Object.defineProperty(anchor, 'ownerDocument', {
      value: {
        baseURI: 'https://example.com/',
        defaultView: {
          location: { origin: 'https://example.com', assign, replace },
        },
      },
    });
    pointerDown(anchor);
    expect(replace).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/docs/guide',
    );
    expect(observe).toHaveBeenCalledWith(expect.anything(), {
      kind: 'document',
      method: 'replace',
    });
    fail = true;
    expect(captureErrors(() => pointerDown(anchor))).toEqual([failure]);
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/docs/guide',
    );
    expect(observe).toHaveBeenCalledTimes(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  },
);
