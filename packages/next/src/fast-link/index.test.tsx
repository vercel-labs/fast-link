/*
 * Tests FastLink's routing options, cancellation, click handling, and ref updates
 * with mocked Next Link and App Router. Real framework and browser integration
 * is covered in scripts/browser/next.pw.mjs.
 */

import { act, fireEvent, render } from '@testing-library/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { pointerDown, router, captureErrors } from '../testing';
import { FastLink } from './index';

describe('FastLink', () => {
  it('starts accepted navigation once and preserves the pre-base-path string', () => {
    const { getByRole } = render(
      <FastLink href="/pricing?from=nav#plans">Pricing</FastLink>,
    );

    pointerDown(getByRole('link'));
    fireEvent.click(getByRole('link'), { detail: 1 });

    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      '/pricing?from=nav#plans',
      {
        scroll: undefined,
        transitionTypes: undefined,
      },
    );
  });

  it('uses replace, scroll, and transition types', () => {
    const { getByRole } = render(
      <FastLink
        href="/pricing"
        replace
        scroll={false}
        transitionTypes={['slide']}
      >
        Pricing
      </FastLink>,
    );

    pointerDown(getByRole('link'));
    fireEvent.click(getByRole('link'), { detail: 1 });

    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/pricing', {
      scroll: false,
      transitionTypes: ['slide'],
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps an object pathname while using the validated query and hash', () => {
    const { getByRole } = render(
      <FastLink
        href={{ pathname: '/caf%C3%A9', query: { ref: 'a b' }, hash: 'menu' }}
      >
        Café
      </FastLink>,
    );

    pointerDown(getByRole('link'));
    fireEvent.click(getByRole('link'), { detail: 1 });

    expect(router.push).toHaveBeenCalledWith(
      '/caf%C3%A9?ref=a+b#menu',
      expect.anything(),
    );
  });

  it('runs onNavigate before onFastNavigate and honors cancellation', () => {
    const order: string[] = [];
    const { getByRole } = render(
      <FastLink
        href="/pricing"
        onNavigate={(event) => {
          order.push('onNavigate');
          event.preventDefault();
        }}
        onFastNavigate={() => order.push('onFastNavigate')}
      >
        Pricing
      </FastLink>,
    );

    const anchor = getByRole('link');
    pointerDown(anchor);
    const click = fireEvent.click(anchor, { detail: 1 });

    expect(order).toEqual(['onNavigate']);
    expect(router.push).not.toHaveBeenCalled();
    expect(click).toBe(false);
  });

  it('navigates after click handlers while preserving bubbling', () => {
    const events: string[] = [];
    const { getByRole } = render(
      <div onClick={() => events.push('parent')}>
        <FastLink
          href="/pricing"
          onClick={() => events.push('click')}
          onNavigate={() => events.push('navigate')}
          onFastNavigate={() => events.push('fast')}
        >
          Pricing
        </FastLink>
      </div>,
    );

    const anchor = getByRole('link');
    pointerDown(anchor);
    const allowed = fireEvent.click(anchor, { detail: 1 });

    expect(allowed).toBe(false);
    expect(events).toEqual(['click', 'navigate', 'fast', 'parent']);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['touch', 'touch', {}],
    ['pen', 'pen', {}],
    ['modified', 'mouse', { ctrlKey: true }],
  ] as const)(
    'leaves %s pointer input to Link',
    (_name, pointerType, input) => {
      const { getByRole } = render(
        <FastLink href="/pricing">Pricing</FastLink>,
      );

      pointerDown(getByRole('link'), pointerType, input);

      expect(router.push).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['native', { mode: 'native' as const }],
    ['external', { href: 'https://other.example/pricing' }],
    ['hash', { href: '#pricing' }],
  ])('leaves %s links to Link', (_name, props) => {
    const { getByRole } = render(
      <FastLink href="/pricing" {...props}>
        Pricing
      </FastLink>,
    );

    pointerDown(getByRole('link'));

    expect(router.push).not.toHaveBeenCalled();
  });

  it('uses current props at click after a destination update', () => {
    const { getByRole, rerender } = render(
      <FastLink href="/first">First</FastLink>,
    );
    const anchor = getByRole('link');
    pointerDown(anchor);

    rerender(<FastLink href="/second">Second</FastLink>);
    const allowed = fireEvent.click(anchor, { detail: 1 });
    pointerDown(anchor);

    expect(allowed).toBe(false);
    expect(router.push.mock.calls.map(([href]) => href)).toEqual(['/second']);
  });

  it('uses committed navigation props before parent layout effects run', () => {
    const navigated: string[] = [];

    function Parent({ href, replace }: { href: string; replace: boolean }) {
      const anchor = useRef<HTMLAnchorElement>(null);

      useLayoutEffect(() => {
        if (href === '/second' && anchor.current) {
          expect(anchor.current.getAttribute('href')).toBe('/docs/second');
          pointerDown(anchor.current);
          fireEvent.click(anchor.current, { detail: 1 });
        }
      }, [href]);

      return (
        <FastLink
          href={href}
          replace={replace}
          ref={anchor}
          onNavigate={() => navigated.push(href)}
        >
          Destination
        </FastLink>
      );
    }

    const { rerender } = render(<Parent href="/first" replace={false} />);
    rerender(<Parent href="/second" replace />);

    expect(navigated).toEqual(['/second']);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/second', {
      scroll: undefined,
      transitionTypes: undefined,
    });
  });

  it('keeps the gesture when an inline ref changes on rerender', () => {
    const { getByRole, rerender } = render(
      <FastLink
        href="/first"
        ref={(element) => element?.setAttribute('data-ref-attached', 'true')}
      >
        First
      </FastLink>,
    );
    const anchor = getByRole('link');
    pointerDown(anchor);

    rerender(
      <FastLink
        href="/second"
        ref={(element) => element?.setAttribute('data-ref-attached', 'true')}
      >
        Second
      </FastLink>,
    );
    const allowed = fireEvent.click(anchor, { detail: 1 });

    expect(allowed).toBe(false);
    expect(router.push).toHaveBeenCalledExactlyOnceWith(
      '/second',
      expect.anything(),
    );
  });

  it('keeps one fast navigation when onFastNavigate rerenders an inline ref', () => {
    function RerenderingLink() {
      const [count, setCount] = useState(0);
      return (
        <FastLink
          href="/pricing"
          ref={(element) => element?.setAttribute('data-ref-attached', 'true')}
          onFastNavigate={() => setCount((value) => value + 1)}
        >
          Pricing {count}
        </FastLink>
      );
    }

    const { getByRole } = render(<RerenderingLink />);
    const anchor = getByRole('link');
    act(() => pointerDown(anchor));
    const allowed = fireEvent.click(anchor, { detail: 1 });

    expect(anchor.textContent).toBe('Pricing 1');
    expect(allowed).toBe(false);
    expect(router.push).toHaveBeenCalledTimes(1);
  });

  it('updates forwarded refs and navigation options across rerenders', () => {
    const events: string[] = [];
    const firstRef = (element: HTMLAnchorElement | null) => {
      if (element) {
        events.push('first attach');
        return () => {
          events.push('first cleanup');
        };
      }
      events.push('first null');
    };
    const secondRef = (element: HTMLAnchorElement | null) => {
      if (element) {
        events.push('second attach');
        return () => {
          events.push('second cleanup');
        };
      }
      events.push('second null');
    };
    const { getByRole, rerender, unmount } = render(
      <FastLink href="/first" ref={firstRef}>
        First
      </FastLink>,
    );
    const anchor = getByRole('link');
    pointerDown(anchor);

    rerender(
      <FastLink
        href="/second"
        ref={secondRef}
        replace
        scroll={false}
        transitionTypes={['slide']}
      >
        Second
      </FastLink>,
    );
    const allowed = fireEvent.click(anchor, { detail: 1 });
    pointerDown(anchor);
    unmount();

    expect(events).toEqual([
      'first attach',
      'first cleanup',
      'second attach',
      'second cleanup',
    ]);
    expect(allowed).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/second', {
      scroll: false,
      transitionTypes: ['slide'],
    });
  });

  it('updates object refs before parent layout effects observe them', () => {
    const first = { current: null as HTMLAnchorElement | null };
    const second = { current: null as HTMLAnchorElement | null };
    const observed: Array<
      [HTMLAnchorElement | null, HTMLAnchorElement | null]
    > = [];

    function Parent({ swapped }: { swapped: boolean }) {
      useLayoutEffect(() => {
        observed.push([first.current, second.current]);
      }, [swapped]);
      return (
        <FastLink href="/pricing" ref={swapped ? second : first}>
          Pricing
        </FastLink>
      );
    }

    const { getByRole, rerender } = render(<Parent swapped={false} />);
    const anchor = getByRole('link');
    rerender(<Parent swapped />);

    expect(observed).toEqual([
      [anchor, null],
      [null, anchor],
    ]);
  });

  it('survives repeated rerenders without duplicating navigation', () => {
    const { getByRole, rerender } = render(
      <FastLink
        href="/first"
        ref={(element) => element?.setAttribute('data-ref-attached', 'true')}
      >
        First
      </FastLink>,
    );
    const anchor = getByRole('link');

    for (let iteration = 0; iteration < 50; iteration++) {
      rerender(
        <FastLink
          href={`/route-${iteration}`}
          ref={(element) => element?.setAttribute('data-ref-attached', 'true')}
        >
          Route {iteration}
        </FastLink>,
      );
      pointerDown(anchor);
      rerender(
        <FastLink
          href={`/route-${iteration}`}
          ref={(element) => element?.setAttribute('data-ref-attached', 'true')}
        >
          Route {iteration}
        </FastLink>,
      );
      expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);
    }

    expect(router.push).toHaveBeenCalledTimes(50);
    expect(router.push.mock.calls.map(([href]) => href)).toEqual(
      Array.from({ length: 50 }, (_, iteration) => `/route-${iteration}`),
    );
  });

  it('forwards the anchor ref and removes the controller on unmount', () => {
    const ref = { current: null as HTMLAnchorElement | null };
    const { getByRole, unmount } = render(
      <FastLink href="/pricing" ref={ref}>
        Pricing
      </FastLink>,
    );
    const anchor = getByRole('link');
    expect(ref.current).toBe(anchor);

    unmount();
    pointerDown(anchor);

    expect(ref.current).toBeNull();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('runs a callback ref cleanup on unmount', () => {
    const events: string[] = [];
    const { unmount } = render(
      <FastLink
        href="/pricing"
        ref={(element) => {
          if (element) {
            events.push('attach');
            return () => {
              events.push('cleanup');
            };
          }
          events.push('null');
        }}
      >
        Pricing
      </FastLink>,
    );

    unmount();

    expect(events).toEqual(['attach', 'cleanup']);
  });

  it('attempts routing and surfaces a throwing observer', () => {
    const failure = new Error('observer failed');
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      const { getByRole } = render(
        <FastLink
          href="/pricing"
          onFastNavigate={() => {
            throw failure;
          }}
        >
          Pricing
        </FastLink>,
      );
      const anchor = getByRole('link');
      pointerDown(anchor);
      expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);
    } finally {
      window.removeEventListener('error', onError);
    }

    expect(errors).toEqual([failure]);
    expect(router.push).toHaveBeenCalledExactlyOnceWith('/pricing', {
      scroll: undefined,
      transitionTypes: undefined,
    });
  });
});

it('skips policy and observation after Link cancellation', () => {
  const policy = vi.fn();
  const observe = vi.fn();
  const { getByRole } = render(
    <FastLink
      href="/pricing"
      navigationPolicy={policy}
      onFastNavigate={observe}
      onNavigate={(event) => event.preventDefault()}
    >
      Pricing
    </FastLink>,
  );
  pointerDown(getByRole('link'));
  expect(fireEvent.click(getByRole('link'), { detail: 1 })).toBe(false);
  expect(policy).not.toHaveBeenCalled();
  expect(observe).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});

it('surfaces Link guard errors at click without navigating', () => {
  const failure = new Error('onNavigate failed');
  const policy = vi.fn();
  const { getByRole } = render(
    <FastLink
      href="/pricing"
      navigationPolicy={policy}
      onNavigate={() => {
        throw failure;
      }}
    >
      Pricing
    </FastLink>,
  );
  const anchor = getByRole('link');
  expect(captureErrors(() => pointerDown(anchor))).toEqual([]);
  expect(captureErrors(() => fireEvent.click(anchor, { detail: 1 }))).toEqual([
    failure,
  ]);
  expect(policy).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});

describe('immediate mode', () => {
  it('runs onNavigate, policy, and navigation on press, then prevents the follow-up click', () => {
    const events: string[] = [];
    router.experimental_prepare = vi.fn();
    const { getByRole } = render(
      <div onClick={() => events.push('parent')}>
        <FastLink
          href="/pricing"
          mode="immediate"
          navigationPolicy={() => {
            events.push('policy');
            return { kind: 'router' };
          }}
          onNavigate={() => events.push('navigate')}
          onFastNavigate={() => events.push('fast')}
          onClickCapture={(event) =>
            events.push(
              event.defaultPrevented ? 'capture prevented' : 'capture allowed',
            )
          }
          onClick={(event) =>
            events.push(event.defaultPrevented ? 'prevented' : 'allowed')
          }
        >
          Pricing
        </FastLink>
      </div>,
    );
    const anchor = getByRole('link');

    pointerDown(anchor);
    expect(events).toEqual(['navigate', 'policy', 'fast']);
    expect(router.push).toHaveBeenCalledExactlyOnceWith('/pricing', {
      scroll: undefined,
      transitionTypes: undefined,
    });
    expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);

    expect(events).toEqual([
      'navigate',
      'policy',
      'fast',
      'capture prevented',
      'prevented',
      'parent',
    ]);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.experimental_prepare).not.toHaveBeenCalled();
  });

  it.each(['cancels', 'throws'] as const)(
    'keeps the follow-up click prevented when onNavigate %s',
    (outcome) => {
      const failure = new Error('onNavigate failed');
      const policy = vi.fn();
      const { getByRole } = render(
        <FastLink
          href="/pricing"
          mode="immediate"
          navigationPolicy={policy}
          onNavigate={(event) => {
            if (outcome === 'throws') throw failure;
            event.preventDefault();
          }}
        >
          Pricing
        </FastLink>,
      );
      const anchor = getByRole('link');

      expect(captureErrors(() => pointerDown(anchor))).toEqual(
        outcome === 'throws' ? [failure] : [],
      );
      expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);

      expect(policy).not.toHaveBeenCalled();
      expect(router.push).not.toHaveBeenCalled();
    },
  );

  it('navigates with props committed during onNavigate', () => {
    function Consumer() {
      const [changed, setChanged] = useState(false);
      return (
        <FastLink
          href={changed ? '/second' : '/first'}
          mode="immediate"
          replace={changed}
          onNavigate={() => flushSync(() => setChanged(true))}
        >
          Destination
        </FastLink>
      );
    }
    const { getByRole } = render(<Consumer />);

    pointerDown(getByRole('link'));

    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/second', {
      scroll: undefined,
      transitionTypes: undefined,
    });
  });

  it('cancels when onNavigate selects native mode and still prevents the follow-up click', () => {
    function Consumer() {
      const [mode, setMode] = useState<'immediate' | 'native'>('immediate');
      return (
        <FastLink
          href="/pricing"
          mode={mode}
          onNavigate={() => flushSync(() => setMode('native'))}
        >
          Pricing
        </FastLink>
      );
    }
    const { getByRole } = render(<Consumer />);
    const anchor = getByRole('link');

    pointerDown(anchor);
    expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);

    expect(router.push).not.toHaveBeenCalled();
  });

  it('keeps follow-up suppression after switching to native mode', () => {
    const onNavigate = vi.fn();
    const { getByRole, rerender } = render(
      <FastLink href="/pricing" mode="immediate">
        Pricing
      </FastLink>,
    );
    const anchor = getByRole('link');
    pointerDown(anchor);

    rerender(
      <FastLink href="/pricing" mode="native" onNavigate={onNavigate}>
        Pricing
      </FastLink>,
    );
    expect(fireEvent.click(anchor, { detail: 1 })).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledTimes(1);

    pointerDown(anchor);
    fireEvent.click(anchor, { detail: 1 });
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});

it('leaves press and click to Next Link in native mode', () => {
  const policy = vi.fn();
  const onNavigate = vi.fn();
  router.experimental_prepare = vi.fn();
  const { getByRole } = render(
    <FastLink
      href="/pricing"
      mode="native"
      navigationPolicy={policy}
      onNavigate={onNavigate}
    >
      Pricing
    </FastLink>,
  );
  const anchor = getByRole('link');

  pointerDown(anchor);
  fireEvent.click(anchor, { detail: 1 });

  expect(anchor.hasAttribute('mode')).toBe(false);
  expect(onNavigate).toHaveBeenCalledTimes(1);
  expect(router.experimental_prepare).not.toHaveBeenCalled();
  expect(policy).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});
