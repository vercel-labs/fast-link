import { fireEvent, render } from '@testing-library/react';
import { useState } from 'react';
import { flushSync } from 'react-dom';

import { pointerDown, router, captureErrors } from '../testing';
import { FastLink } from './index';

it('prepares before click and commits once after caller guards', () => {
  const events: string[] = [];
  const push = vi.fn(() => events.push('commit'));
  const prepare = vi.fn(() => ({ push, replace: vi.fn() }));
  Object.assign(router, { experimental_prepare: prepare });
  const policy = vi.fn(() => {
    events.push('policy');
    return { kind: 'router' as const };
  });
  const { getByRole } = render(
    <FastLink
      href="/guide"
      navigationPolicy={policy}
      onClick={() => events.push('click')}
      onNavigate={() => events.push('guard')}
      onFastNavigate={() => events.push('observe')}
    >
      Guide
    </FastLink>,
  );
  const anchor = getByRole('link');
  pointerDown(anchor);
  expect(prepare).toHaveBeenCalledExactlyOnceWith('/guide');
  expect(events).toEqual(['policy']);
  expect(router.push).not.toHaveBeenCalled();
  fireEvent.click(anchor, { detail: 1 });
  expect(events).toEqual([
    'policy',
    'click',
    'guard',
    'policy',
    'observe',
    'commit',
  ]);
  expect(push).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
});

it.each(['onClick', 'onNavigate'] as const)(
  'honors %s cancellation after one preparation-time classification',
  (guard) => {
    const push = vi.fn();
    const prepare = vi.fn(() => ({ push, replace: vi.fn() }));
    router.experimental_prepare = prepare;
    const policy = vi.fn(() => ({ kind: 'router' as const }));
    const observe = vi.fn();
    const { getByRole } = render(
      <FastLink
        href="/guide"
        navigationPolicy={policy}
        onFastNavigate={observe}
        {...{
          [guard]: (event: { preventDefault(): void }) =>
            event.preventDefault(),
        }}
      >
        Guide
      </FastLink>,
    );
    const anchor = getByRole('link');
    pointerDown(anchor);
    fireEvent.click(anchor, { detail: 1 });
    expect(policy).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  },
);

it('does not prepare foreign routes and uses current policy ownership at click', () => {
  const push = vi.fn();
  router.experimental_prepare = vi.fn(() => ({ push, replace: vi.fn() }));
  const assign = vi.fn();
  const policy = vi.fn((intent: { anchor: HTMLAnchorElement }) =>
    intent.anchor.dataset.zone === 'same'
      ? { kind: 'router' as const }
      : { kind: 'document' as const, method: 'assign' as const },
  );
  const { getByRole } = render(
    <FastLink href="/guide" data-zone="foreign" navigationPolicy={policy}>
      Guide
    </FastLink>,
  );
  const anchor = getByRole('link');
  Object.defineProperty(anchor, 'ownerDocument', {
    value: {
      baseURI: 'https://example.com/',
      defaultView: {
        MouseEvent,
        location: { origin: 'https://example.com', assign },
      },
    },
  });
  pointerDown(anchor);
  expect(router.experimental_prepare).not.toHaveBeenCalled();
  fireEvent.click(anchor, { detail: 1 });
  expect(assign).toHaveBeenCalledExactlyOnceWith(
    'https://example.com/docs/guide',
  );
  anchor.dataset.zone = 'same';
  pointerDown(anchor);
  anchor.dataset.zone = 'foreign';
  fireEvent.click(anchor, { detail: 1 });
  expect(router.experimental_prepare).toHaveBeenCalledTimes(1);
  expect(assign).toHaveBeenCalledTimes(2);
  expect(push).not.toHaveBeenCalled();
});

it.each(['throw', 'invalid'] as const)(
  'keeps %s policy errors speculative until accepted click',
  (mode) => {
    router.experimental_prepare = vi.fn();
    const failure = new Error('policy failed');
    const assign = vi.fn();
    const observe = vi.fn();
    const policy = vi.fn(() => {
      if (mode === 'throw') throw failure;
      return null as never;
    });
    const { getByRole } = render(
      <FastLink
        href="/guide"
        navigationPolicy={policy}
        onFastNavigate={observe}
      >
        Guide
      </FastLink>,
    );
    const anchor = getByRole('link');
    Object.defineProperty(anchor, 'ownerDocument', {
      value: {
        baseURI: 'https://example.com/',
        defaultView: {
          MouseEvent,
          location: { origin: 'https://example.com', assign },
        },
      },
    });
    expect(captureErrors(() => pointerDown(anchor))).toEqual([]);
    expect(assign).not.toHaveBeenCalled();
    const errors = captureErrors(() => fireEvent.click(anchor, { detail: 1 }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual(
      mode === 'throw'
        ? failure
        : new TypeError('Invalid Fast Navigation decision'),
    );
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/docs/guide',
    );
    expect(router.experimental_prepare).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  },
);

it.each(['absent', 'throws'] as const)(
  'falls back at click when preparation %s',
  (mode) => {
    if (mode === 'throws')
      router.experimental_prepare = vi.fn(() => {
        throw new Error('disabled router queue');
      });
    const { getByRole } = render(
      <FastLink
        href="/guide"
        replace
        scroll={false}
        transitionTypes={['slide']}
      >
        Guide
      </FastLink>,
    );
    const anchor = getByRole('link');
    pointerDown(anchor);
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(anchor, { detail: 1 });
    expect(router.replace).toHaveBeenCalledExactlyOnceWith('/guide', {
      scroll: false,
      transitionTypes: ['slide'],
    });
  },
);

it('discards stale preparation after href and options change', () => {
  const push = vi.fn();
  const replace = vi.fn();
  router.experimental_prepare = vi.fn(() => ({ push, replace }));
  const { getByRole, rerender } = render(
    <FastLink href="/first">Guide</FastLink>,
  );
  const anchor = getByRole('link');
  pointerDown(anchor);
  rerender(
    <FastLink href="/second" replace scroll={false}>
      Guide
    </FastLink>,
  );
  fireEvent.click(anchor, { detail: 1 });
  expect(push).not.toHaveBeenCalled();
  expect(replace).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledExactlyOnceWith('/second', {
    scroll: false,
    transitionTypes: undefined,
  });
});

it('never retries a failed prepared commit through ordinary routing', () => {
  const failure = new Error('commit failed');
  const push = vi.fn(() => {
    throw failure;
  });
  router.experimental_prepare = vi.fn(() => ({ push, replace: vi.fn() }));
  const { getByRole } = render(<FastLink href="/guide">Guide</FastLink>);
  const anchor = getByRole('link');
  pointerDown(anchor);
  expect(captureErrors(() => fireEvent.click(anchor, { detail: 1 }))).toEqual([
    failure,
  ]);
  expect(push).toHaveBeenCalledTimes(1);
  expect(router.push).not.toHaveBeenCalled();
});

it.each(['onClick', 'onNavigate'] as const)(
  'uses policy committed during %s instead of the prepared router handle',
  (guard) => {
    const push = vi.fn();
    router.experimental_prepare = vi.fn(() => ({ push, replace: vi.fn() }));
    const firstPolicy = vi.fn(() => ({ kind: 'router' as const }));
    const nextPolicy = vi.fn(() => ({
      kind: 'document' as const,
      method: 'assign' as const,
    }));
    const assign = vi.fn();
    function Consumer() {
      const [changed, setChanged] = useState(false);
      return (
        <FastLink
          href="/guide"
          navigationPolicy={changed ? nextPolicy : firstPolicy}
          {...{ [guard]: () => flushSync(() => setChanged(true)) }}
        >
          Guide
        </FastLink>
      );
    }
    const { getByRole } = render(<Consumer />);
    const anchor = getByRole('link');
    Object.defineProperty(anchor, 'ownerDocument', {
      value: {
        baseURI: 'https://example.com/',
        defaultView: {
          MouseEvent,
          location: { origin: 'https://example.com', assign },
        },
      },
    });
    pointerDown(anchor);
    fireEvent.click(anchor, { detail: 1 });

    expect(firstPolicy).toHaveBeenCalledTimes(1);
    expect(nextPolicy).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledExactlyOnceWith(
      'https://example.com/docs/guide',
    );
    expect(push).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  },
);

it('uses routing options and observation committed during onNavigate', () => {
  const push = vi.fn();
  const replace = vi.fn();
  const firstObserver = vi.fn();
  const nextObserver = vi.fn();
  router.experimental_prepare = vi.fn(() => ({ push, replace }));
  function Consumer() {
    const [changed, setChanged] = useState(false);
    return (
      <FastLink
        href="/guide"
        navigationPolicy={() => ({ kind: 'router' })}
        replace={changed}
        scroll={!changed}
        transitionTypes={changed ? ['updated'] : ['original']}
        onFastNavigate={changed ? nextObserver : firstObserver}
        onNavigate={() => flushSync(() => setChanged(true))}
      >
        Guide
      </FastLink>
    );
  }
  const { getByRole } = render(<Consumer />);
  const anchor = getByRole('link');
  pointerDown(anchor);
  fireEvent.click(anchor, { detail: 1 });

  expect(push).not.toHaveBeenCalled();
  expect(replace).toHaveBeenCalledExactlyOnceWith({
    scroll: false,
    transitionTypes: ['updated'],
  });
  expect(router.replace).not.toHaveBeenCalled();
  expect(firstObserver).not.toHaveBeenCalled();
  expect(nextObserver).toHaveBeenCalledTimes(1);
});

it('uses an onNavigate guard committed during onClick', () => {
  const push = vi.fn();
  const guard = vi.fn((event: { preventDefault(): void }) =>
    event.preventDefault(),
  );
  router.experimental_prepare = vi.fn(() => ({ push, replace: vi.fn() }));
  function Consumer() {
    const [changed, setChanged] = useState(false);
    return (
      <FastLink
        href="/guide"
        onClick={() => flushSync(() => setChanged(true))}
        onNavigate={changed ? guard : undefined}
      >
        Guide
      </FastLink>
    );
  }
  const { getByRole } = render(<Consumer />);
  const anchor = getByRole('link');
  pointerDown(anchor);
  fireEvent.click(anchor, { detail: 1 });

  expect(guard).toHaveBeenCalledTimes(1);
  expect(push).not.toHaveBeenCalled();
  expect(router.push).not.toHaveBeenCalled();
});
