import { createClickPreparation } from './index';

function press(target: Element, options: MouseEventInit = {}): void {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...options,
  });
  Object.defineProperty(event, 'pointerType', { value: 'mouse' });
  target.dispatchEvent(event);
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

it('prepares on press and consumes a matched click only once', () => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/pricing';
  const prepared = { request: 'pricing' };
  const prepare = vi.fn(() => prepared);
  const controller = createClickPreparation(anchor, { prepare });
  try {
    const press = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
    Object.defineProperty(press, 'pointerType', { value: 'mouse' });
    anchor.dispatchEvent(press);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe('/');

    const click = new MouseEvent('click', { detail: 1, cancelable: true });
    Object.defineProperty(click, 'target', { value: anchor });
    const activation = controller.matchClick(click);
    expect(click.defaultPrevented).toBe(false);
    expect(controller.matchClick(click)).toBeNull();
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
  vi.useFakeTimers();
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
    vi.useRealTimers();
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

it('keeps click fallback after preparation fails and invalidates matched work when disabled', () => {
  const anchor = document.body.appendChild(document.createElement('a'));
  anchor.href = '/guide';
  const prepare = () => {
    throw new Error('speculative failure');
  };
  const controller = createClickPreparation(anchor, { prepare });
  try {
    press(anchor);
    expect(
      controller.matchClick(click(anchor))?.consume()?.prepared,
    ).toBeNull();
    press(anchor);
    const activation = controller.matchClick(click(anchor));
    controller.update({ enabled: false, prepare });
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
