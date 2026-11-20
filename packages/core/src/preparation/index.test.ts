import type { FastLinkIntent } from '../interaction';
import { createClickPreparation } from './index';

function dispatchPress(target: Element, options: MouseEventInit = {}): void {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...options,
  });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  target.dispatchEvent(event);
}

/** Presses, then runs the preparation task that follows the press. */
function press(target: Element, options: MouseEventInit = {}): void {
  dispatchPress(target, options);
  vi.runOnlyPendingTimers();
}

function click(target: Element, options: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('click', {
    detail: 1,
    cancelable: true,
    ...options,
  });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

function failPreparation(): never {
  throw new Error('speculative failure');
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

it('prepares after press and consumes a matched click only once', () => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/pricing';
  const prepared = { request: 'pricing' };
  const prepare = vi.fn(() => prepared);
  const controller = createClickPreparation(anchor, { prepare });
  try {
    const pressEvent = new MouseEvent('pointerdown', {
      bubbles: true,
      button: 0,
    });
    Object.defineProperty(pressEvent, 'pointerType', { value: 'mouse' });
    anchor.dispatchEvent(pressEvent);
    vi.runOnlyPendingTimers();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/');

    const clickEvent = new MouseEvent('click', {
      detail: 1,
      cancelable: true,
    });
    Object.defineProperty(clickEvent, 'target', { value: anchor });
    const activation = controller.matchClick(clickEvent);
    expect(clickEvent.defaultPrevented).toBe(false);
    expect(controller.matchClick(clickEvent)).toBeNull();
    expect(activation?.consume()).toEqual({
      intent: {
        anchor,
        href: '/pricing',
        url: new URL('https://example.com/pricing'),
      },
      prepared,
    });
    expect(activation?.consume()).toBeNull();
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it.each([
  'pointercancel',
  'dragstart',
  'keydown',
  'outside-press',
  'release-away',
  'release-no-click',
  'destroy',
])('discards after %s', async (action) => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const controller = createClickPreparation(anchor, {
    prepare: () => 'request',
  });
  try {
    press(anchor);
    if (action === 'destroy') controller.destroy();
    else if (action === 'outside-press') press(document.body);
    else if (action === 'release-away')
      document.body.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true }),
      );
    else if (action === 'release-no-click') {
      anchor.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      await vi.runAllTimersAsync();
    } else anchor.dispatchEvent(new Event(action, { bubbles: true }));
    expect(controller.matchClick(click(anchor))).toBeNull();
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it('revalidates after guards and falls back for a changed destination', () => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/first';
  const controller = createClickPreparation(anchor, {
    prepare: () => 'old request',
  });
  try {
    press(anchor);
    const activation = controller.matchClick(click(anchor));
    anchor.href = '/second';
    expect(activation?.consume()).toEqual({
      intent: {
        anchor,
        href: '/second',
        url: new URL('https://example.com/second'),
      },
      prepared: null,
    });
    press(anchor);
    const optedOut = controller.matchClick(click(anchor));
    anchor.setAttribute('download', '');
    expect(optedOut?.consume()).toBeNull();
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it('rejects a candidate whose link left the root before consume', () => {
  const root = document.body.appendChild(document.createElement('div'));
  const anchor = root.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const controller = createClickPreparation(root, { prepare: () => 'guide' });
  try {
    press(anchor);
    const activation = controller.matchClick(click(anchor));
    expect(activation).not.toBeNull();
    document.body.append(anchor);
    expect(activation?.consume()).toBeNull();
  } finally {
    controller.destroy();
    root.remove();
    anchor.remove();
  }
});

it('keeps click fallback after preparation fails and invalidates matched work when disabled', () => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const controller = createClickPreparation(anchor, {
    prepare: failPreparation,
  });
  try {
    press(anchor);
    expect(
      controller.matchClick(click(anchor))?.consume()?.prepared,
    ).toBeNull();
    press(anchor);
    const activation = controller.matchClick(click(anchor));
    controller.update({ enabled: false, prepare: failPreparation });
    expect(activation?.consume()).toBeNull();
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it('coordinates nested roots, disabled managed anchors, frozen events, and separate copies', async () => {
  const root = document.body.appendChild(document.createElement('div'));
  root.innerHTML = '<section><a href="/guide">Guide</a></section>';
  const inner = root.firstElementChild as HTMLElement;
  const anchor = inner.firstElementChild as HTMLAnchorElement;
  const outerPrepare = vi.fn(() => 'outer');
  const innerPrepare = vi.fn(() => 'inner');
  const outer = createClickPreparation(root, { prepare: outerPrepare });
  vi.resetModules();
  const other = await import('./index');
  const nested = other.createClickPreparation(inner, { prepare: innerPrepare });
  const managed = other.createClickPreparation(anchor, {
    enabled: false,
    prepare: () => 'managed',
  });
  try {
    press(anchor);
    expect(outerPrepare).not.toHaveBeenCalled();
    managed.destroy();
    const event = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(event, 'pointerType', { value: 'mouse' });
    anchor.dispatchEvent(Object.freeze(event));
    vi.runOnlyPendingTimers();
    expect(outerPrepare).toHaveBeenCalledTimes(1);
    expect(innerPrepare).not.toHaveBeenCalled();
    const activationEvent = Object.freeze(click(anchor));
    expect(outer.matchClick(activationEvent)?.consume()?.prepared).toBe(
      'outer',
    );
    expect(nested.matchClick(activationEvent)).toBeNull();
  } finally {
    outer.destroy();
    nested.destroy();
    managed.destroy();
    root.remove();
  }
});

it.each([{ detail: 0 }, { metaKey: true }, { button: 1 }])(
  'keeps nonmatching activation native: %o',
  (options) => {
    const anchor = document.body.appendChild(document.createElement('a'));
    anchor.href = '/guide';
    const controller = createClickPreparation(anchor, {
      prepare: () => 'request',
    });
    try {
      press(anchor);
      const event = click(anchor, options);
      expect(controller.matchClick(event)).toBeNull();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      controller.destroy();
      anchor.remove();
    }
  },
);

it.each([
  { pointerType: 'mouse', pointerId: 7, matches: true },
  { pointerType: 'mouse', pointerId: 8, matches: false },
  { pointerType: 'touch', pointerId: 7, matches: false },
  { pointerType: 'pen', pointerId: 7, matches: false },
])('matches only the prepared mouse pointer: %o', (pointer) => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const prepare = vi.fn(() => 'request');
  const controller = createClickPreparation(anchor, { prepare });
  try {
    const down = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperties(down, {
      pointerType: { value: 'mouse' },
      pointerId: { value: 7 },
    });
    anchor.dispatchEvent(down);
    vi.runOnlyPendingTimers();
    expect(prepare).toHaveBeenCalledTimes(1);

    const event = click(anchor);
    Object.defineProperties(event, {
      pointerType: { value: pointer.pointerType },
      pointerId: { value: pointer.pointerId },
    });
    const candidate = controller.matchClick(event);
    if (pointer.matches) {
      expect(candidate?.consume()?.prepared).toBe('request');
    } else {
      expect(candidate).toBeNull();
    }
    expect(event.defaultPrevented).toBe(false);
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it.each([
  { release: 'another pointer', pointerId: { value: 8 } },
  { release: 'no pointer id', pointerId: undefined },
])('discards a release on the anchor from $release', ({ pointerId }) => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const controller = createClickPreparation(anchor, {
    prepare: () => 'request',
  });
  try {
    const down = new MouseEvent('pointerdown', { bubbles: true });
    Object.defineProperties(down, {
      pointerType: { value: 'mouse' },
      pointerId: { value: 7 },
    });
    anchor.dispatchEvent(down);

    const up = new MouseEvent('pointerup', { bubbles: true });
    if (pointerId) Object.defineProperty(up, 'pointerId', pointerId);
    anchor.dispatchEvent(up);

    const event = click(anchor);
    Object.defineProperties(event, {
      pointerType: { value: 'mouse' },
      pointerId: { value: 7 },
    });
    expect(controller.matchClick(event)).toBeNull();
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it.each(['consume', 'cancel', 'destroy'] as const)(
  'releases gesture listeners and the release timer after %s',
  (finish) => {
    const host = document.body.appendChild(document.createElement('div'));
    const shadow = host.attachShadow({ mode: 'closed' });
    const anchor = shadow.appendChild(document.createElement('a'));
    anchor.href = '/guide';
    const rootSubscription = {
      add: vi.spyOn(anchor, 'addEventListener'),
      remove: vi.spyOn(anchor, 'removeEventListener'),
    };
    const gestureSubscriptions = [document, window, shadow].map((target) => ({
      add: vi.spyOn(target, 'addEventListener'),
      remove: vi.spyOn(target, 'removeEventListener'),
    }));
    const subscriptions = [rootSubscription, ...gestureSubscriptions];
    const controller = createClickPreparation(anchor, {
      prepare: () => 'request',
    });
    try {
      press(anchor);
      anchor.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, composed: true }),
      );
      expect(vi.getTimerCount()).toBe(1);
      for (const { remove } of subscriptions) remove.mockClear();

      if (finish === 'consume') {
        expect(controller.matchClick(click(anchor))?.consume()?.prepared).toBe(
          'request',
        );
      } else if (finish === 'cancel') {
        document.dispatchEvent(new Event('pointercancel'));
      } else {
        controller.destroy();
      }

      expect(vi.getTimerCount()).toBe(0);
      // Gesture subscriptions end before a reusable controller is destroyed.
      for (const { add, remove } of gestureSubscriptions) {
        expect(add).toHaveBeenCalled();
        for (const registration of add.mock.calls) {
          expect(remove).toHaveBeenCalledWith(...registration);
        }
      }
      controller.destroy();
      for (const registration of rootSubscription.add.mock.calls) {
        expect(rootSubscription.remove).toHaveBeenCalledWith(...registration);
      }
    } finally {
      controller.destroy();
      for (const { add, remove } of subscriptions) {
        add.mockRestore();
        remove.mockRestore();
      }
      host.remove();
    }
  },
);

it.each(['before-match', 'after-match'] as const)(
  'defers to managed ownership acquired %s',
  (phase) => {
    const root = document.body.appendChild(document.createElement('div'));
    const anchor = root.appendChild(document.createElement('a'));
    anchor.href = '/guide';
    const controller = createClickPreparation(root, {
      prepare: () => 'region',
    });
    let managed: ReturnType<typeof createClickPreparation<string>> | undefined;
    try {
      press(anchor);
      const candidate =
        phase === 'after-match' ? controller.matchClick(click(anchor)) : null;
      managed = createClickPreparation(anchor, {
        enabled: false,
        prepare: () => 'managed',
      });
      expect(
        (candidate ?? controller.matchClick(click(anchor)))?.consume(),
      ).toBeNull();
    } finally {
      managed?.destroy();
      controller.destroy();
      root.remove();
    }
  },
);

it.each(['pointercancel', 'dragstart', 'keydown', 'outside-press', 'blur'])(
  'invalidates a matched candidate after %s during a guard',
  (action) => {
    const anchor = document.body.appendChild(document.createElement('a'));
    anchor.href = '/guide';
    const controller = createClickPreparation(anchor, {
      prepare: () => 'request',
    });
    try {
      press(anchor);
      const candidate = controller.matchClick(click(anchor));
      if (action === 'outside-press') press(document.body);
      else if (action === 'blur') window.dispatchEvent(new Event('blur'));
      else anchor.dispatchEvent(new Event(action, { bubbles: true }));
      expect(candidate?.consume()).toBeNull();
    } finally {
      controller.destroy();
      anchor.remove();
    }
  },
);

it.each(['consume', 'discard'] as const)(
  'does not clear a newer gesture or its cancellation when an old candidate calls %s',
  (finish) => {
    const anchor = document.body.appendChild(document.createElement('a'));
    anchor.href = '/guide';
    const controller = createClickPreparation(anchor, {
      prepare: () => 'request',
    });
    try {
      press(anchor);
      const old = controller.matchClick(click(anchor));
      press(anchor);
      old?.[finish]();
      const current = controller.matchClick(click(anchor));
      expect(current).not.toBeNull();
      press(document.body);
      expect(current?.consume()).toBeNull();
    } finally {
      controller.destroy();
      anchor.remove();
    }
  },
);

it.each(['consume', 'cancel'] as const)(
  'preserves a gesture started inside prepare until %s',
  (finish) => {
    const anchor = document.body.appendChild(document.createElement('a'));
    anchor.href = '/first';
    const prepare = vi.fn((intent: FastLinkIntent) => {
      if (intent.href === '/first') {
        anchor.href = '/second';
        press(anchor);
        return 'first request';
      }
      return 'second request';
    });
    const controller = createClickPreparation(anchor, { prepare });
    try {
      press(anchor);
      expect(prepare).toHaveBeenCalledTimes(2);
      const candidate = controller.matchClick(click(anchor));
      expect(candidate).not.toBeNull();
      if (finish === 'cancel')
        document.dispatchEvent(new Event('pointercancel'));
      expect(candidate?.consume()).toEqual(
        finish === 'cancel'
          ? null
          : {
              intent: {
                anchor,
                href: '/second',
                url: new URL('https://example.com/second'),
              },
              prepared: 'second request',
            },
      );
    } finally {
      controller.destroy();
      anchor.remove();
    }
  },
);

it('copies options and applies replacements only through update', () => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const first = vi.fn(() => 'first');
  const second = vi.fn(() => 'second');
  const options = { prepare: first };
  const controller = createClickPreparation(anchor, options);
  try {
    options.prepare = second;
    press(anchor);
    expect(controller.matchClick(click(anchor))?.consume()?.prepared).toBe(
      'first',
    );
    controller.update(options);
    press(anchor);
    expect(controller.matchClick(click(anchor))?.consume()?.prepared).toBe(
      'second',
    );
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it('retains anchor ownership until the last controller is destroyed', () => {
  const root = document.body.appendChild(document.createElement('div'));
  const anchor = root.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const prepare = vi.fn(() => null);
  const region = createClickPreparation(root, { prepare });
  const first = createClickPreparation(anchor, { enabled: false, prepare });
  const second = createClickPreparation(anchor, { enabled: false, prepare });
  try {
    first.destroy();
    first.destroy();
    press(anchor);
    expect(prepare).not.toHaveBeenCalled();
    second.destroy();
    press(anchor);
    expect(prepare).toHaveBeenCalledTimes(1);
  } finally {
    first.destroy();
    second.destroy();
    region.destroy();
    root.remove();
  }
});

it('drops preparation when relative URL resolution changes without an href change', () => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = 'next';
  const controller = createClickPreparation(anchor, {
    prepare: () => 'request',
  });
  const base = document.head.appendChild(document.createElement('base'));
  try {
    base.href = '/first/';
    press(anchor);
    base.href = '/second/';
    expect(controller.matchClick(click(anchor))?.consume()).toEqual({
      intent: {
        anchor,
        href: 'next',
        url: new URL('https://example.com/second/next'),
      },
      prepared: null,
    });
  } finally {
    controller.destroy();
    anchor.remove();
    base.remove();
  }
});

it('prepares and consumes nothing while the root is inactive', () => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const prepare = vi.fn(() => 'guide');
  let isActive = false;
  const controller = createClickPreparation(
    anchor,
    { prepare },
    () => isActive,
  );
  try {
    press(anchor);
    expect(prepare).not.toHaveBeenCalled();

    isActive = true;
    press(anchor);
    const activation = controller.matchClick(click(anchor));
    expect(activation).not.toBeNull();
    isActive = false;
    expect(activation?.consume()).toBeNull();
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it('prepares in the task after pointerdown, not during it', () => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const prepare = vi.fn(() => 'request');
  const controller = createClickPreparation(anchor, { prepare });
  try {
    dispatchPress(anchor);
    expect(prepare).not.toHaveBeenCalled();
    vi.runOnlyPendingTimers();
    expect(prepare).toHaveBeenCalledExactlyOnceWith({
      anchor,
      href: '/guide',
      url: new URL('https://example.com/guide'),
    });
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it('gives a click matched before the task no preparation and never prepares', () => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const prepare = vi.fn(() => 'request');
  const controller = createClickPreparation(anchor, { prepare });
  try {
    dispatchPress(anchor);
    const activation = controller.matchClick(click(anchor));
    vi.runAllTimers();
    expect(prepare).not.toHaveBeenCalled();
    expect(activation?.consume()).toEqual({
      intent: {
        anchor,
        href: '/guide',
        url: new URL('https://example.com/guide'),
      },
      prepared: null,
    });
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it.each([
  'release on the link with no click',
  'release away',
  'pointercancel',
  'press elsewhere',
  'disable',
  'inactive root',
  'destroy',
])('never prepares after %s before the task', (action) => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const prepare = vi.fn(() => 'request');
  let isActive = true;
  const controller = createClickPreparation(
    anchor,
    { prepare },
    () => isActive,
  );
  try {
    dispatchPress(anchor);
    if (action === 'release on the link with no click')
      anchor.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    else if (action === 'release away')
      document.body.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true }),
      );
    else if (action === 'pointercancel')
      anchor.dispatchEvent(new Event('pointercancel', { bubbles: true }));
    else if (action === 'press elsewhere') dispatchPress(document.body);
    else if (action === 'disable')
      controller.update({ enabled: false, prepare });
    else if (action === 'inactive root') isActive = false;
    else controller.destroy();
    vi.runAllTimers();
    expect(prepare).not.toHaveBeenCalled();
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it('prepares only the latest of two presses before the task', () => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/first';
  const prepare = vi.fn((intent: FastLinkIntent) => intent.href);
  const controller = createClickPreparation(anchor, { prepare });
  try {
    dispatchPress(anchor);
    anchor.href = '/second';
    dispatchPress(anchor);
    vi.runAllTimers();
    expect(prepare.mock.calls.map(([{ href }]) => href)).toEqual(['/second']);
  } finally {
    controller.destroy();
    anchor.remove();
  }
});

it('skips the task when a managed anchor takes ownership first', () => {
  const root = document.body.appendChild(document.createElement('div'));
  const anchor = root.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const prepare = vi.fn(() => 'region');
  const region = createClickPreparation(root, { prepare });
  let managed: ReturnType<typeof createClickPreparation<string>> | undefined;
  try {
    dispatchPress(anchor);
    managed = createClickPreparation(anchor, {
      enabled: false,
      prepare: () => 'managed',
    });
    vi.runAllTimers();
    expect(prepare).not.toHaveBeenCalled();
  } finally {
    managed?.destroy();
    region.destroy();
    root.remove();
  }
});
