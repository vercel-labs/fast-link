/*
 * Exercises mode selection, closest-region ownership, immediate guards, and
 * follow-up click suppression through the public controller with simulated
 * events. Trusted browser input is covered by scripts/browser/core.pw.mjs.
 */

import type { FastLinkIntent } from '../interaction';
import { createClickPreparation } from '../preparation';
import type { LinkInteractionOptions, LinkMode } from './index';
import { createLinkInteraction } from './index';

type Calls = string[];

function press(target: Element, pointerType = 'mouse'): PointerEvent {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
  });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
  return event as PointerEvent;
}

/** Dispatches a pointer click and reports whether its default was prevented. */
function click(target: Element): boolean {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    detail: 1,
  });
  let prevented = false;
  // Record suppression, then stop jsdom from scheduling the default navigation.
  const observe = (observed: Event) => {
    prevented = observed.defaultPrevented;
    observed.preventDefault();
  };
  document.addEventListener('click', observe, { once: true });
  target.dispatchEvent(event);
  return prevented;
}

function clickEvent(target: Element): MouseEvent {
  const event = new MouseEvent('click', { detail: 1, cancelable: true });
  Object.defineProperty(event, 'target', { value: target });
  return event;
}

/** Builds options for `mode` that record every callback as `<name>:<call>:<href>`. */
function recording(
  mode: LinkMode,
  name: string,
  calls: Calls,
): LinkInteractionOptions<string> {
  if (mode === 'release') {
    return {
      mode,
      prepare: ({ href }) => {
        calls.push(`${name}:prepare:${href}`);
        return name;
      },
    };
  }
  if (mode === 'immediate') {
    return {
      mode,
      beforeNavigate: ({ href }) => {
        calls.push(`${name}:guard:${href}`);
        return true;
      },
      navigate: ({ href }) => calls.push(`${name}:navigate:${href}`),
    };
  }
  return { mode };
}

function expectedCalls(mode: LinkMode, name: string, href: string): Calls {
  if (mode === 'release') return [`${name}:prepare:${href}`];
  if (mode === 'immediate')
    return [`${name}:guard:${href}`, `${name}:navigate:${href}`];
  return [];
}

function find(root: ParentNode, selector: string): HTMLAnchorElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) throw new Error(`Missing ${selector}`);
  return element as HTMLAnchorElement;
}

function spyListeners(targets: EventTarget[]) {
  const spies = targets.map((target) => vi.spyOn(target, 'addEventListener'));
  return {
    types: () => spies.flatMap((spy) => spy.mock.calls.map(([type]) => type)),
    restore: () => {
      for (const spy of spies) spy.mockRestore();
    },
  };
}

function setup(html: string): HTMLElement {
  const container = document.body.appendChild(document.createElement('div'));
  container.innerHTML = html;
  return container;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('modes', () => {
  it('prepares in release mode and consumes the matching click once', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    const calls: Calls = [];
    const controller = createLinkInteraction(
      anchor,
      recording('release', 'link', calls),
    );
    try {
      press(anchor);
      expect(calls).toEqual(['link:prepare:/guide']);
      const event = clickEvent(anchor);
      expect(controller.suppressClick(event)).toBe(false);
      const candidate = controller.matchClick(event);
      expect(candidate?.consume()).toEqual({
        intent: {
          anchor,
          href: '/guide',
          url: new URL('https://example.com/guide'),
        },
        prepared: 'link',
      });
      expect(candidate?.consume()).toBeNull();
      expect(event.defaultPrevented).toBe(false);
    } finally {
      controller.destroy();
    }
  });

  it('navigates on press in immediate mode and suppresses only the follow-up click', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    const calls: Calls = [];
    const bubbled: Calls = [];
    const onBubble = () => bubbled.push('bubble');
    document.addEventListener('click', onBubble);
    const controller = createLinkInteraction(
      anchor,
      recording('immediate', 'link', calls),
    );
    try {
      press(anchor);
      expect(calls).toEqual(['link:guard:/guide', 'link:navigate:/guide']);
      expect(controller.matchClick(clickEvent(anchor))).toBeNull();
      expect(click(anchor)).toBe(true);
      expect(bubbled).toEqual(['bubble']);
      expect(click(anchor)).toBe(false);
    } finally {
      controller.destroy();
      document.removeEventListener('click', onBubble);
    }
  });

  it('leaves new input native in native mode without callbacks', () => {
    const root = setup('<a href="/guide">Guide</a>');
    const anchor = find(root, 'a');
    const outerCalls: Calls = [];
    const outer = createLinkInteraction(
      document.body,
      recording('immediate', 'outer', outerCalls),
    );
    const controller = createLinkInteraction(root, { mode: 'native' });
    try {
      const event = press(anchor);
      expect(controller.matchClick(clickEvent(anchor))).toBeNull();
      expect(click(anchor)).toBe(false);
      // The native region owns the link, so the outer region never claims it.
      expect(outerCalls).toEqual([]);
      expect(event.defaultPrevented).toBe(false);
    } finally {
      controller.destroy();
      outer.destroy();
    }
  });

  it.each(['touch', 'pen'])('keeps %s input native', (pointerType) => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    const calls: Calls = [];
    const controller = createLinkInteraction(
      anchor,
      recording('immediate', 'link', calls),
    );
    try {
      press(anchor, pointerType);
      expect(calls).toEqual([]);
      expect(click(anchor)).toBe(false);
    } finally {
      controller.destroy();
    }
  });
});

describe('ownership', () => {
  const modes: LinkMode[] = ['release', 'immediate', 'native'];
  const pairs = modes.flatMap((outer) => modes.map((inner) => [outer, inner]));

  it.each(pairs)(
    'lets the closest region own an ordinary link: outer %s, inner %s in another copy',
    async (outerMode, innerMode) => {
      vi.resetModules();
      const other = await import('./index');
      const root = setup('<section><a href="/guide">Guide</a></section>');
      const inner = find(root, 'section');
      const anchor = find(root, 'a');
      const calls: Calls = [];
      const outerController = createLinkInteraction(
        root,
        recording(outerMode, 'outer', calls),
      );
      const innerController = other.createLinkInteraction(
        inner,
        recording(innerMode, 'inner', calls),
      );
      try {
        press(anchor);
        expect(calls).toEqual(expectedCalls(innerMode, 'inner', '/guide'));
        const event = clickEvent(anchor);
        expect(outerController.matchClick(event)).toBeNull();
        expect(innerController.matchClick(event)?.consume()?.prepared).toBe(
          innerMode === 'release' ? 'inner' : undefined,
        );
      } finally {
        innerController.destroy();
        outerController.destroy();
      }
    },
  );

  it.each(pairs)(
    'keeps a managed %s anchor over a %s region',
    (anchorMode, regionMode) => {
      const root = setup('<a href="/guide">Guide</a>');
      const anchor = find(root, 'a');
      const calls: Calls = [];
      const region = createLinkInteraction(
        root,
        recording(regionMode, 'region', calls),
      );
      const managed = createLinkInteraction(
        anchor,
        recording(anchorMode, 'anchor', calls),
      );
      try {
        press(anchor);
        expect(calls).toEqual(expectedCalls(anchorMode, 'anchor', '/guide'));
        expect(region.matchClick(clickEvent(anchor))).toBeNull();
      } finally {
        managed.destroy();
        region.destroy();
      }
    },
  );

  it('returns ownership to the containing region when the closer root is destroyed', () => {
    const root = setup('<section><a href="/guide">Guide</a></section>');
    const anchor = find(root, 'a');
    const calls: Calls = [];
    const outer = createLinkInteraction(
      root,
      recording('immediate', 'outer', calls),
    );
    const inner = createLinkInteraction(find(root, 'section'), {
      mode: 'native',
    });
    try {
      inner.destroy();
      inner.destroy();
      press(anchor);
      expect(calls).toEqual(expectedCalls('immediate', 'outer', '/guide'));
    } finally {
      outer.destroy();
    }
  });

  it.each(['region', 'anchor'] as const)(
    'rechecks ownership after the guard when a closer %s attaches',
    (owner) => {
      const root = setup('<section><a href="/guide">Guide</a></section>');
      const anchor = find(root, 'a');
      const navigate = vi.fn();
      let late: { destroy(): void } | undefined;
      const controller = createLinkInteraction(root, {
        mode: 'immediate',
        beforeNavigate: () => {
          late = createLinkInteraction(
            owner === 'region' ? find(root, 'section') : anchor,
            { mode: 'native' },
          );
          return true;
        },
        navigate,
      });
      try {
        press(anchor);
        expect(navigate).not.toHaveBeenCalled();
        expect(click(anchor)).toBe(true);
      } finally {
        late?.destroy();
        controller.destroy();
      }
    },
  );

  it('rechecks closest-region ownership before consuming a release candidate', () => {
    const root = setup('<section><a href="/guide">Guide</a></section>');
    const anchor = find(root, 'a');
    const controller = createLinkInteraction(root, {
      mode: 'release',
      prepare: () => 'outer',
    });
    let inner: { destroy(): void } | undefined;
    try {
      press(anchor);
      const candidate = controller.matchClick(clickEvent(anchor));
      inner = createLinkInteraction(find(root, 'section'), {
        mode: 'native',
      });
      expect(candidate?.consume()).toBeNull();
    } finally {
      inner?.destroy();
      controller.destroy();
    }
  });

  it.each([
    ['out of the region', 0, () => document.body],
    ['within the region', 1, (root: HTMLElement) => find(root, 'section')],
  ])(
    'rechecks containment after the guard moves the link %s',
    (_, navigations, destination) => {
      const root = setup('<section></section><a href="/guide">Guide</a>');
      const anchor = find(root, 'a');
      const navigate = vi.fn();
      const controller = createLinkInteraction(root, {
        mode: 'immediate',
        beforeNavigate: () => {
          destination(root).append(anchor);
          return true;
        },
        navigate,
      });
      try {
        press(anchor);
        expect(navigate).toHaveBeenCalledTimes(navigations);
      } finally {
        controller.destroy();
      }
    },
  );

  it('rejects a release candidate whose link left the region before consume', () => {
    const root = setup('<a href="/guide">Guide</a>');
    const anchor = find(root, 'a');
    const controller = createLinkInteraction(root, {
      mode: 'release',
      prepare: () => 'prepared',
    });
    try {
      press(anchor);
      const candidate = controller.matchClick(clickEvent(anchor));
      expect(candidate).not.toBeNull();
      document.body.append(anchor);
      expect(candidate?.consume()).toBeNull();
    } finally {
      controller.destroy();
    }
  });

  it('adds region ownership to a registry created by an earlier version', async () => {
    const key = Symbol.for('@fast-link/core/coordination');
    const previous: unknown = Reflect.get(globalThis, key);
    const earlier = {
      anchorOwners: new WeakMap(),
      pendingClickOwners: new WeakMap(),
      suppressedClicks: new WeakSet(),
      handledEvents: new WeakSet(),
    };
    Reflect.set(globalThis, key, earlier);
    vi.resetModules();
    try {
      const first = await import('./index');
      vi.resetModules();
      const second = await import('./index');
      const root = setup('<section><a href="/guide">Guide</a></section>');
      const anchor = find(root, 'a');
      const calls: Calls = [];
      const outer = first.createLinkInteraction(
        root,
        recording('immediate', 'outer', calls),
      );
      const inner = second.createLinkInteraction(
        find(root, 'section'),
        recording('immediate', 'inner', calls),
      );
      try {
        press(anchor);
        expect(calls).toEqual(expectedCalls('immediate', 'inner', '/guide'));
        expect(Reflect.get(globalThis, key)).toBe(earlier);
        expect(earlier.pendingClickOwners.has(anchor)).toBe(true);
      } finally {
        inner.destroy();
        outer.destroy();
      }
    } finally {
      Reflect.set(globalThis, key, previous);
    }
  });

  it('keeps a native managed anchor native inside a preparation-only region', () => {
    const root = setup('<a href="/guide">Guide</a>');
    const anchor = find(root, 'a');
    const prepare = vi.fn(() => 'region');
    const region = createClickPreparation(root, { prepare });
    const managed = createLinkInteraction(anchor, { mode: 'native' });
    try {
      press(anchor);
      expect(prepare).not.toHaveBeenCalled();
      expect(region.matchClick(clickEvent(anchor))).toBeNull();
    } finally {
      managed.destroy();
      region.destroy();
    }
  });

  it('gives a preparation-only managed anchor priority over a link interaction region', () => {
    const root = setup('<a href="/guide">Guide</a>');
    const anchor = find(root, 'a');
    const navigate = vi.fn();
    const region = createLinkInteraction<null>(root, {
      mode: 'immediate',
      navigate,
    });
    const managed = createClickPreparation(anchor, {
      prepare: () => 'managed',
    });
    try {
      press(anchor);
      expect(navigate).not.toHaveBeenCalled();
      expect(click(anchor)).toBe(false);
      press(anchor);
      expect(managed.matchClick(clickEvent(anchor))?.consume()?.prepared).toBe(
        'managed',
      );
    } finally {
      managed.destroy();
      region.destroy();
    }
  });

  it('shares anchor ownership and suppression with the press controller', async () => {
    vi.resetModules();
    const { createFastLink } = await import('../controller');
    const root = setup('<a href="/guide">Guide</a>');
    const anchor = find(root, 'a');
    const regionNavigate = vi.fn();
    const linkNavigate = vi.fn();
    const region = createFastLink(root, { navigate: regionNavigate });
    const link = createLinkInteraction(anchor, {
      mode: 'immediate',
      navigate: linkNavigate,
    });
    try {
      press(anchor);
      expect(regionNavigate).not.toHaveBeenCalled();
      expect(linkNavigate).toHaveBeenCalledTimes(1);
      const preventDefault = vi.fn();
      region.suppressClick({ target: anchor, detail: 1, preventDefault });
      expect(preventDefault).toHaveBeenCalledTimes(1);
    } finally {
      link.destroy();
      region.destroy();
    }
  });
});

describe('immediate guard', () => {
  const guardError = new Error('guard failed');

  it.each([
    ['returns false', () => false, []],
    [
      'throws',
      () => {
        throw guardError;
      },
      [guardError],
    ],
  ])(
    'keeps the follow-up click suppressed when the guard %s',
    (_, guard, expectedErrors) => {
      const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
      const navigate = vi.fn();
      const errors: unknown[] = [];
      const onError = (event: ErrorEvent) => {
        errors.push(event.error);
        event.preventDefault();
      };
      window.addEventListener('error', onError);
      const controller = createLinkInteraction(anchor, {
        mode: 'immediate',
        beforeNavigate: guard,
        navigate,
      });
      try {
        press(anchor);
        expect(navigate).not.toHaveBeenCalled();
        expect(errors).toEqual(expectedErrors);
        expect(click(anchor)).toBe(true);
      } finally {
        window.removeEventListener('error', onError);
        controller.destroy();
      }
    },
  );

  it.each([
    [
      'a mode change',
      (controller: Controller) => controller.update({ mode: 'native' }),
    ],
    [
      'a mode change and back',
      (controller: Controller, navigate: () => void) => {
        controller.update({ mode: 'release', prepare: () => null });
        controller.update({ mode: 'immediate', navigate });
      },
    ],
    [
      'new input at the root',
      (_: Controller, __: () => void, anchor: HTMLAnchorElement) => {
        press(anchor, 'touch');
      },
    ],
    ['destruction', (controller: Controller) => controller.destroy()],
  ])('cancels the attempt after %s during the guard', (_, change) => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    const navigate = vi.fn();
    const controller: Controller = createLinkInteraction<null>(anchor, {
      mode: 'immediate',
      beforeNavigate: () => {
        change(controller, navigate, anchor);
        return true;
      },
      navigate,
    });
    try {
      press(anchor);
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      controller.destroy();
    }
  });

  it('navigates with current options and href after a same-mode update during the guard', () => {
    const anchor = find(setup('<a href="/first">Guide</a>'), 'a');
    const calls: Calls = [];
    const navigate = (intent: FastLinkIntent) =>
      calls.push(`stale:${intent.href}`);
    const controller: Controller = createLinkInteraction<null>(anchor, {
      mode: 'immediate',
      beforeNavigate: () => {
        anchor.setAttribute('href', '/second');
        controller.update({
          mode: 'immediate',
          navigate: ({ href, url }) =>
            calls.push(`current:${href}:${url.href}`),
        });
        return true;
      },
      navigate,
    });
    try {
      press(anchor);
      expect(calls).toEqual(['current:/second:https://example.com/second']);
    } finally {
      controller.destroy();
    }
  });
});

type Controller = ReturnType<typeof createLinkInteraction<null>>;

describe('follow-up click suppression', () => {
  it.each([
    ['native', { mode: 'native' }],
    ['release', { mode: 'release', prepare: () => null }],
    ['immediate', { mode: 'immediate', navigate: () => undefined }],
  ] as const)(
    'survives a change to %s mode and href until its click',
    (_, nextOptions) => {
      const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
      const navigate = vi.fn();
      const controller = createLinkInteraction<null>(anchor, {
        mode: 'immediate',
        navigate,
      });
      try {
        press(anchor);
        controller.update(nextOptions);
        anchor.setAttribute('href', '/changed');
        const event = clickEvent(anchor);
        expect(controller.matchClick(event)).toBeNull();
        expect(controller.suppressClick(event)).toBe(true);
        expect(event.defaultPrevented).toBe(true);
        expect(controller.suppressClick(clickEvent(anchor))).toBe(false);
        expect(navigate).toHaveBeenCalledTimes(1);
      } finally {
        controller.destroy();
      }
    },
  );

  it.each(['root press', 'destroy'] as const)(
    'settles on the next %s in native mode',
    (settle) => {
      const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
      const controller = createLinkInteraction<null>(anchor, {
        mode: 'immediate',
        navigate: () => undefined,
      });
      try {
        press(anchor);
        controller.update({ mode: 'native' });
        if (settle === 'destroy') controller.destroy();
        else press(anchor, 'touch');
        expect(click(anchor)).toBe(false);
      } finally {
        controller.destroy();
      }
    },
  );

  it('leaves detail-zero and out-of-anchor clicks native', () => {
    const root = setup(
      '<a href="/first">First</a><a href="/second">Second</a>',
    );
    const first = find(root, 'a[href="/first"]');
    const second = find(root, 'a[href="/second"]');
    const controller = createLinkInteraction<null>(root, {
      mode: 'immediate',
      navigate: () => undefined,
    });
    try {
      press(first);
      const keyboard = new MouseEvent('click', { detail: 0, cancelable: true });
      Object.defineProperty(keyboard, 'target', { value: first });
      expect(controller.suppressClick(keyboard)).toBe(false);
      expect(click(second)).toBe(false);
      expect(click(first)).toBe(true);
    } finally {
      controller.destroy();
    }
  });

  it('suppresses a managed descendant claim from a containing root in another copy', async () => {
    vi.resetModules();
    const other = await import('./index');
    const root = setup('<a href="/guide">Guide</a>');
    const anchor = find(root, 'a');
    const region = createLinkInteraction<null>(root, { mode: 'native' });
    const link = other.createLinkInteraction<null>(anchor, {
      mode: 'immediate',
      navigate: () => undefined,
    });
    try {
      press(anchor);
      const event = clickEvent(anchor);
      expect(region.suppressClick(event)).toBe(true);
      expect(event.defaultPrevented).toBe(true);
      // A later wrapper for the same click also learns that it was suppressed.
      expect(link.suppressClick(event)).toBe(true);
    } finally {
      link.destroy();
      region.destroy();
    }
  });

  it('keeps a newer shared claim when an older root is destroyed', () => {
    const first = setup('<a href="/guide">Guide</a>');
    const second = setup('');
    const anchor = find(first, 'a');
    const options = { mode: 'immediate', navigate: () => undefined } as const;
    const older = createLinkInteraction<null>(first, options);
    const newer = createLinkInteraction<null>(second, options);
    const bridge = createLinkInteraction<null>(second, { mode: 'native' });
    try {
      press(anchor);
      second.append(anchor);
      press(anchor);
      older.destroy();
      expect(bridge.suppressClick(clickEvent(anchor))).toBe(true);
    } finally {
      older.destroy();
      newer.destroy();
      bridge.destroy();
    }
  });
});

describe('selected-path work', () => {
  it.each([
    ['immediate', { mode: 'immediate', navigate: () => undefined }, ['click']],
    [
      'release',
      { mode: 'release', prepare: () => null },
      [
        'blur',
        'dragstart',
        'keydown',
        'pointercancel',
        'pointerdown',
        'pointerup',
      ],
    ],
    ['native', { mode: 'native' }, []],
  ] as const)(
    'allocates only %s listeners on an eligible press',
    (_, options, expected) => {
      const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
      const controller = createLinkInteraction<null>(anchor, options);
      const listeners = spyListeners([anchor, document, window]);
      try {
        press(anchor);
        // Registration order is incidental; compare the sorted types.
        expect(listeners.types().toSorted()).toEqual(expected);
        expect(controller.suppressClick(clickEvent(anchor))).toBe(
          options.mode === 'immediate',
        );
      } finally {
        listeners.restore();
        controller.destroy();
      }
    },
  );

  it('removes every listener on destroy', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    const subscriptions = [anchor, document, window].map((target) => ({
      add: vi.spyOn(target, 'addEventListener'),
      remove: vi.spyOn(target, 'removeEventListener'),
    }));
    const controller = createLinkInteraction<null>(anchor, {
      mode: 'immediate',
      navigate: () => undefined,
    });
    try {
      press(anchor);
      controller.update({ mode: 'release', prepare: () => null });
      press(document.body);
      press(anchor);
      controller.destroy();
      for (const { add, remove } of subscriptions) {
        for (const registration of add.mock.calls) {
          expect(remove).toHaveBeenCalledWith(...registration);
        }
      }
    } finally {
      for (const { add, remove } of subscriptions) {
        add.mockRestore();
        remove.mockRestore();
      }
      controller.destroy();
    }
  });
});

describe('updates', () => {
  it('discards release work on a mode change and cannot revive it', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    const navigate = vi.fn();
    const prepare = vi.fn(() => 'request');
    const controller = createLinkInteraction(anchor, {
      mode: 'release',
      prepare,
    });
    try {
      press(anchor);
      const candidate = controller.matchClick(clickEvent(anchor));
      controller.update({ mode: 'immediate', navigate });
      controller.update({ mode: 'release', prepare });
      expect(candidate?.consume()).toBeNull();
      expect(controller.matchClick(clickEvent(anchor))).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(click(anchor)).toBe(false);
    } finally {
      controller.destroy();
    }
  });

  it('keeps pending release work across a same-mode update', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    const second = vi.fn(() => 'second');
    const options = { mode: 'release' as const, prepare: () => 'first' };
    const controller = createLinkInteraction(anchor, options);
    try {
      options.prepare = second;
      press(anchor);
      controller.update(options);
      expect(
        controller.matchClick(clickEvent(anchor))?.consume()?.prepared,
      ).toBe('first');
      press(anchor);
      expect(second).toHaveBeenCalledTimes(1);
    } finally {
      controller.destroy();
    }
  });

  it('ignores updates after destroy', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    const navigate = vi.fn();
    const controller = createLinkInteraction<null>(anchor, { mode: 'native' });
    controller.destroy();
    controller.update({ mode: 'immediate', navigate });
    press(anchor);
    expect(navigate).not.toHaveBeenCalled();
    expect(click(anchor)).toBe(false);
  });
});

describe('root activity', () => {
  it.each(['release', 'immediate'] as const)(
    'leaves %s presses native while the root is inactive',
    (mode) => {
      const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
      const calls: Calls = [];
      const controller = createLinkInteraction(
        anchor,
        recording(mode, 'link', calls),
        () => false,
      );
      try {
        press(anchor);
        expect(calls).toEqual([]);
        expect(click(anchor)).toBe(false);
      } finally {
        controller.destroy();
      }
    },
  );

  it('cancels immediate navigation when the guard deactivates the root', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    const navigate = vi.fn();
    let isActive = true;
    const controller = createLinkInteraction(
      anchor,
      {
        mode: 'immediate',
        beforeNavigate: () => {
          isActive = false;
          return true;
        },
        navigate,
      },
      () => isActive,
    );
    try {
      press(anchor);
      expect(navigate).not.toHaveBeenCalled();
      // Like a canceled guard, the claimed press keeps its click suppressed.
      expect(click(anchor)).toBe(true);
    } finally {
      controller.destroy();
    }
  });

  it('rejects a release candidate consumed after the root deactivates', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    let isActive = true;
    const controller = createLinkInteraction(
      anchor,
      { mode: 'release', prepare: () => 'prepared' },
      () => isActive,
    );
    try {
      press(anchor);
      const candidate = controller.matchClick(clickEvent(anchor));
      expect(candidate).not.toBeNull();
      isActive = false;
      expect(candidate?.consume()).toBeNull();
    } finally {
      controller.destroy();
    }
  });

  it('rejects a release click matched after the root deactivates', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    let isActive = true;
    const controller = createLinkInteraction(
      anchor,
      { mode: 'release', prepare: () => 'prepared' },
      () => isActive,
    );
    try {
      press(anchor);
      isActive = false;
      expect(controller.matchClick(clickEvent(anchor))).toBeNull();
    } finally {
      controller.destroy();
    }
  });

  it('settles earlier suppression on a press while the root is inactive', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    const navigate = vi.fn();
    let isActive = true;
    const controller = createLinkInteraction(
      anchor,
      { mode: 'immediate', navigate },
      () => isActive,
    );
    try {
      press(anchor);
      isActive = false;
      press(anchor);
      expect(navigate).toHaveBeenCalledTimes(1);
      expect(click(anchor)).toBe(false);
    } finally {
      controller.destroy();
    }
  });

  it('keeps earlier suppression for a framework handler after the root deactivates', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    let isActive = true;
    const controller = createLinkInteraction(
      anchor,
      { mode: 'immediate', navigate: vi.fn() },
      () => isActive,
    );
    try {
      press(anchor);
      isActive = false;
      expect(controller.suppressClick(clickEvent(anchor))).toBe(true);
    } finally {
      controller.destroy();
    }
  });

  it('keeps immediate suppression when discard runs', () => {
    const anchor = find(setup('<a href="/guide">Guide</a>'), 'a');
    const controller = createLinkInteraction(anchor, {
      mode: 'immediate',
      navigate: vi.fn(),
    });
    try {
      press(anchor);
      controller.discard();
      expect(click(anchor)).toBe(true);
    } finally {
      controller.destroy();
    }
  });
});
