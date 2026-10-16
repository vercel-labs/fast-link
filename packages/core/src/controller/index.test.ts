/*
 * Uses simulated DOM events to test controller ordering, follow-up click
 * suppression, option updates, and cleanup. Nested roots and separately loaded
 * core copies must still navigate only once.
 */

import { createFastLink, type FastLinkOptions } from './index';

interface PointerEventOptions extends MouseEventInit {
  pointerType?: string;
}

function createAnchor(
  attributes: Record<string, string> = {},
): HTMLAnchorElement {
  const anchor = document.createElement('a');
  for (const [name, value] of Object.entries(attributes)) {
    anchor.setAttribute(name, value);
  }
  return anchor;
}

function dispatchPointerDown(
  target: Element,
  options: PointerEventOptions = {},
): void {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...options,
  });
  Object.defineProperty(event, 'pointerType', {
    value: options.pointerType ?? 'mouse',
  });
  target.dispatchEvent(event);
}

describe('createFastLink', () => {
  it('navigates on primary mouse pointerdown before click', () => {
    const root = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.href = '/pricing';
    root.append(anchor);
    const events: string[] = [];
    const fastLink = createFastLink(root, {
      navigate: ({ href }) => events.push(`navigate:${href}`),
    });

    dispatchPointerDown(anchor);

    expect(events).toEqual(['navigate:/pricing']);
    fastLink.destroy();
  });

  it('notifies before navigating', () => {
    const anchor = createAnchor({ href: '/pricing' });
    const events: string[] = [];
    const fastLink = createFastLink(anchor, {
      onFastNavigate: ({ href }) => events.push(`notify:${href}`),
      navigate: ({ href }) => events.push(`navigate:${href}`),
    });

    dispatchPointerDown(anchor);

    expect(events).toEqual(['notify:/pricing', 'navigate:/pricing']);
    fastLink.destroy();
  });

  it('replaces options without losing pending click suppression', () => {
    const anchor = createAnchor({ href: '/pricing' });
    const firstNavigations: string[] = [];
    const secondNavigations: string[] = [];
    const notifications: string[] = [];
    const fastLink = createFastLink(anchor, {
      enabled: false,
      navigate: ({ url }) => firstNavigations.push(url.href),
      onFastNavigate: ({ url }) => notifications.push(url.href),
    });

    fastLink.update({
      navigate: ({ url }) => secondNavigations.push(url.href),
    });
    dispatchPointerDown(anchor);
    fastLink.update({
      navigate: ({ url }) => secondNavigations.push(url.href),
    });
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });

    anchor.dispatchEvent(click);

    expect(firstNavigations).toEqual([]);
    expect(secondNavigations).toEqual(['https://example.com/pricing']);
    expect(notifications).toEqual([]);
    expect(click.defaultPrevented).toBe(true);
    fastLink.destroy();
  });

  it('observes option mutations only after update', () => {
    const anchor = createAnchor({ href: '/pricing' });
    const navigations: string[] = [];
    const options: FastLinkOptions = {
      enabled: false,
      navigate: ({ url }) => navigations.push(url.href),
    };
    const fastLink = createFastLink(anchor, options);
    options.enabled = true;

    dispatchPointerDown(anchor);
    fastLink.update(options);
    dispatchPointerDown(anchor);

    expect(navigations).toEqual(['https://example.com/pricing']);
    fastLink.destroy();
  });

  it('prevents the follow-up click without stopping propagation', () => {
    const root = document.body.appendChild(document.createElement('div'));
    const anchor = root.appendChild(createAnchor({ href: '/pricing' }));
    const observed: string[] = [];
    const onDocumentCapture = (): void => {
      observed.push('document-capture');
    };
    const onAnchorClick = (): void => {
      observed.push('anchor');
    };
    const onDocumentBubble = (): void => {
      observed.push('document-bubble');
    };
    document.addEventListener('click', onDocumentCapture, { capture: true });
    anchor.addEventListener('click', onAnchorClick);
    document.addEventListener('click', onDocumentBubble);
    const fastLink = createFastLink(root, { navigate: () => undefined });

    try {
      dispatchPointerDown(anchor);
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      });

      const accepted = anchor.dispatchEvent(click);

      expect(accepted).toBe(false);
      expect(click.defaultPrevented).toBe(true);
      expect(observed).toEqual([
        'document-capture',
        'anchor',
        'document-bubble',
      ]);
    } finally {
      fastLink.destroy();
      root.remove();
      document.removeEventListener('click', onDocumentCapture, {
        capture: true,
      });
      document.removeEventListener('click', onDocumentBubble);
    }
  });

  it('does not suppress a later click after a lost click', () => {
    const root = document.createElement('div');
    const anchor = root.appendChild(createAnchor({ href: '/pricing' }));
    const fastLink = createFastLink(root, { navigate: () => undefined });
    const observedDefaultPrevented: boolean[] = [];
    anchor.addEventListener('click', (event) => {
      observedDefaultPrevented.push(event.defaultPrevented);
      event.preventDefault();
    });
    dispatchPointerDown(anchor);

    dispatchPointerDown(anchor, { pointerType: 'touch' });
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });

    anchor.dispatchEvent(click);

    expect(observedDefaultPrevented).toEqual([false]);
    fastLink.destroy();
  });

  it('does not suppress keyboard activation after a lost pointer click', () => {
    const root = document.createElement('div');
    const anchor = root.appendChild(createAnchor({ href: '/pricing' }));
    const fastLink = createFastLink(root, { navigate: () => undefined });
    const observedDefaultPrevented: boolean[] = [];
    anchor.addEventListener('click', (event) => {
      observedDefaultPrevented.push(event.defaultPrevented);
      event.preventDefault();
    });
    dispatchPointerDown(anchor);
    const keyboardClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 0,
    });

    anchor.dispatchEvent(keyboardClick);

    expect(observedDefaultPrevented).toEqual([false]);
    fastLink.destroy();
  });

  it('still suppresses the pointer click after a synthetic click', () => {
    const anchor = createAnchor({ href: '/pricing' });
    const fastLink = createFastLink(anchor, { navigate: () => undefined });
    const observedDefaultPrevented: boolean[] = [];
    anchor.addEventListener('click', (event) => {
      observedDefaultPrevented.push(event.defaultPrevented);
      event.preventDefault();
    });
    dispatchPointerDown(anchor);
    const syntheticClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 0,
    });
    const pointerClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });

    anchor.dispatchEvent(syntheticClick);
    anchor.dispatchEvent(pointerClick);

    expect(observedDefaultPrevented).toEqual([false, true]);
    fastLink.destroy();
  });

  it('navigates once through nested roots', () => {
    const outer = document.createElement('div');
    const inner = outer.appendChild(document.createElement('div'));
    const anchor = inner.appendChild(createAnchor({ href: '/pricing' }));
    const navigations: string[] = [];
    const outerFastLink = createFastLink(outer, {
      navigate: () => navigations.push('outer'),
    });
    const innerFastLink = createFastLink(inner, {
      navigate: () => navigations.push('inner'),
    });

    dispatchPointerDown(anchor);

    expect(navigations).toEqual(['outer']);
    innerFastLink.destroy();
    outerFastLink.destroy();
  });

  it.each([true, false])(
    'navigates once through separately loaded package copies, extensible=%s',
    async (extensible) => {
      vi.resetModules();
      const { createFastLink: createOtherFastLink } = await import('./index');
      const outer = document.createElement('div');
      const inner = outer.appendChild(document.createElement('div'));
      const anchor = inner.appendChild(createAnchor({ href: '/pricing' }));
      const navigations: string[] = [];
      const outerFastLink = createFastLink(outer, {
        navigate: () => navigations.push('outer'),
      });
      const innerFastLink = createOtherFastLink(inner, {
        navigate: () => navigations.push('inner'),
      });

      const press = new MouseEvent('pointerdown', { bubbles: true, button: 0 });
      Object.defineProperty(press, 'pointerType', { value: 'mouse' });
      if (!extensible) Object.preventExtensions(press);
      anchor.dispatchEvent(press);

      expect(navigations).toEqual(['outer']);
      innerFastLink.destroy();
      outerFastLink.destroy();
    },
  );

  it.each([true, false])(
    'gives a live anchor controller priority, enabled=%s',
    async (enabled) => {
      vi.resetModules();
      const { createFastLink: otherCopy } = await import('./index');
      const root = document.createElement('div');
      const anchor = root.appendChild(createAnchor({ href: '/pricing' }));
      const events: string[] = [];
      const region = createFastLink(root, {
        navigate: () => events.push('region'),
      });
      const link = otherCopy(anchor, {
        enabled,
        navigate: () => events.push('link'),
      });
      dispatchPointerDown(anchor);
      expect(events).toEqual(enabled ? ['link'] : []);
      link.destroy();
      link.destroy();
      dispatchPointerDown(anchor);
      expect(events).toEqual(enabled ? ['link', 'region'] : ['region']);
      region.destroy();
    },
  );

  it('leaves interactions alone when disabled', () => {
    const anchor = createAnchor({ href: '/pricing' });
    const navigations: string[] = [];
    const fastLink = createFastLink(anchor, {
      enabled: false,
      navigate: () => navigations.push('navigate'),
    });

    dispatchPointerDown(anchor);

    expect(navigations).toEqual([]);
    fastLink.destroy();
  });

  it('stops intercepting after destroy', () => {
    const anchor = createAnchor({ href: '/pricing' });
    const navigations: string[] = [];
    const fastLink = createFastLink(anchor, {
      navigate: () => navigations.push('navigate'),
    });
    fastLink.destroy();
    fastLink.destroy();

    dispatchPointerDown(anchor);

    expect(navigations).toEqual([]);
  });
});

it('retains anchor ownership until the last controller is destroyed', () => {
  const root = document.createElement('div');
  const anchor = root.appendChild(createAnchor({ href: '/pricing' }));
  const route = vi.fn();
  const region = createFastLink(root, { navigate: route });
  const first = createFastLink(anchor, { enabled: false });
  const second = createFastLink(anchor, { enabled: false });
  first.destroy();
  dispatchPointerDown(anchor);
  expect(route).not.toHaveBeenCalled();
  second.destroy();
  dispatchPointerDown(anchor);
  expect(route).toHaveBeenCalledTimes(1);
  region.destroy();
});

it('keeps plain controllers on document assign by default', () => {
  const anchor = createAnchor({ href: '/pricing' });
  const assign = vi.fn();
  Object.defineProperty(anchor, 'ownerDocument', {
    value: {
      baseURI: 'https://example.com/',
      defaultView: {
        location: { origin: 'https://example.com', assign },
      },
    },
  });
  const controller = createFastLink(anchor);
  dispatchPointerDown(anchor);
  expect(assign).toHaveBeenCalledExactlyOnceWith('https://example.com/pricing');
  controller.destroy();
});

it('suppresses a managed click through a containing controller in another copy', async () => {
  vi.resetModules();
  const { createFastLink: otherCopy } = await import('./index');
  const root = document.createElement('div');
  const anchor = root.appendChild(createAnchor({ href: '/pricing' }));
  const navigate = vi.fn();
  const region = createFastLink(root, { navigate });
  const link = otherCopy(anchor, { navigate });
  const preventDefault = vi.fn();

  try {
    dispatchPointerDown(anchor);
    region.suppressClick({ target: anchor, detail: 0, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    const click = { target: anchor, detail: 1, preventDefault };
    region.suppressClick(click);
    region.suppressClick(click);
    link.suppressClick(click);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
  } finally {
    link.destroy();
    region.destroy();
  }
});

it('preserves pending suppression for out-of-root clicks and clears it on destroy', () => {
  const root = document.createElement('div');
  const anchor = root.appendChild(createAnchor({ href: '/pricing' }));
  const controller = createFastLink(root, { navigate: () => undefined });
  const preventDefault = vi.fn();
  dispatchPointerDown(anchor);
  controller.suppressClick({
    target: document.body,
    detail: 1,
    preventDefault,
  });
  controller.suppressClick({ target: window, detail: 1, preventDefault });
  expect(preventDefault).not.toHaveBeenCalled();

  controller.suppressClick({ target: anchor, detail: 1, preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(1);
  dispatchPointerDown(anchor);
  controller.destroy();
  controller.suppressClick({ target: anchor, detail: 1, preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(1);
});

it('retains a newer pending owner when an older root is destroyed', () => {
  const firstRoot = document.createElement('div');
  const secondRoot = document.createElement('div');
  const anchor = firstRoot.appendChild(createAnchor({ href: '/pricing' }));
  const first = createFastLink(firstRoot, { navigate: () => undefined });
  const second = createFastLink(secondRoot, { navigate: () => undefined });
  const bridge = createFastLink(secondRoot, { enabled: false });
  const preventDefault = vi.fn();

  try {
    dispatchPointerDown(anchor);
    secondRoot.append(anchor);
    dispatchPointerDown(anchor);
    first.destroy();
    bridge.suppressClick({ target: anchor, detail: 1, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  } finally {
    first.destroy();
    second.destroy();
    bridge.destroy();
  }
});

it('leaves a sibling click native without consuming the accepted anchor follow-up', () => {
  const root = document.createElement('div');
  const anchor = root.appendChild(createAnchor({ href: '/first' }));
  const pressed = anchor.appendChild(document.createElement('span'));
  const released = anchor.appendChild(document.createElement('span'));
  const sibling = root.appendChild(createAnchor({ href: '/second' }));
  const navigate = vi.fn();
  const controller = createFastLink(root, { navigate });
  const observed: boolean[] = [];
  const dispatchClick = (target: Element): void => {
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
    });
    // Observe suppression before preventing jsdom from scheduling navigation.
    target.addEventListener(
      'click',
      (clickEvent) => clickEvent.preventDefault(),
      {
        once: true,
      },
    );
    target.addEventListener(
      'click',
      (clickEvent) => {
        observed.push(clickEvent.defaultPrevented);
      },
      { capture: true, once: true },
    );
    target.dispatchEvent(event);
  };

  try {
    dispatchPointerDown(pressed);
    dispatchClick(sibling);
    dispatchClick(released);
    expect(observed).toEqual([false, true]);
    expect(navigate).toHaveBeenCalledTimes(1);
  } finally {
    controller.destroy();
  }
});

it.each([false, true])(
  'attempts navigation after an observer error, navigation also throws=%s',
  (navigationThrows) => {
    const observerError = new Error('observer failed');
    const navigationError = new Error('navigation failed');
    const errors: unknown[] = [];
    const onError = (event: ErrorEvent) => {
      errors.push(event.error);
      event.preventDefault();
    };
    const anchor = createAnchor({ href: '/pricing' });
    const order: string[] = [];
    const controller = createFastLink(anchor, {
      onFastNavigate: () => {
        order.push('observe');
        throw observerError;
      },
      navigate: () => {
        order.push('navigate');
        if (navigationThrows) throw navigationError;
      },
    });
    window.addEventListener('error', onError);
    try {
      dispatchPointerDown(anchor);
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      });
      expect(anchor.dispatchEvent(click)).toBe(false);
      expect(order).toEqual(['observe', 'navigate']);
      expect(errors).toEqual([
        navigationThrows ? navigationError : observerError,
      ]);
    } finally {
      window.removeEventListener('error', onError);
      controller.destroy();
    }
  },
);
