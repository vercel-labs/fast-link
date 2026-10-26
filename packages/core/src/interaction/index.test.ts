/*
 * Tests pointer eligibility, anchor lookup within a root, URL resolution against
 * the document base, and how accepted events are claimed only once.
 */

import { findAnchor, resolveFastLink, type FastLinkIntent } from './index';

interface PointerEventOptions extends MouseEventInit {
  defaultPrevented?: boolean;
  pointerType?: string;
  target?: EventTarget | null;
}

function createPointerEvent({
  defaultPrevented = false,
  pointerType = 'mouse',
  target = null,
  ...init
}: PointerEventOptions = {}): PointerEvent {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    button: 0,
    cancelable: true,
    ...init,
  });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    target: { value: target },
  });
  if (defaultPrevented) event.preventDefault();
  return event as PointerEvent;
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

describe('resolveFastLink', () => {
  it('returns authored and resolved destinations for an eligible press', () => {
    const base = document.head.appendChild(document.createElement('base'));
    base.href = '/docs/';
    const anchor = createAnchor({ href: 'pricing?source=nav#plans' });

    try {
      const intent = resolveFastLink(createPointerEvent(), anchor);

      expect(intent).toMatchObject<Partial<FastLinkIntent>>({
        anchor,
        href: 'pricing?source=nav#plans',
      });
      expect(intent?.url.href).toBe(
        'https://example.com/docs/pricing?source=nav#plans',
      );
    } finally {
      base.remove();
    }
  });

  it.each([
    ['touch', createPointerEvent({ pointerType: 'touch' })],
    ['pen', createPointerEvent({ pointerType: 'pen' })],
    ['missing pointer type', createPointerEvent({ pointerType: '' })],
    ['middle button', createPointerEvent({ button: 1 })],
    ['right button', createPointerEvent({ button: 2 })],
    ['Meta modifier', createPointerEvent({ metaKey: true })],
    ['Control modifier', createPointerEvent({ ctrlKey: true })],
    ['Shift modifier', createPointerEvent({ shiftKey: true })],
    ['Alt modifier', createPointerEvent({ altKey: true })],
    ['already prevented event', createPointerEvent({ defaultPrevented: true })],
  ])('leaves %s to native behavior', (_, event) => {
    const anchor = createAnchor({ href: '/pricing' });

    expect(resolveFastLink(event, anchor)).toBeNull();
  });

  it.each([
    ['a missing href', createAnchor()],
    ['a hash-only href', createAnchor({ href: '#plans' })],
    ['a malformed href', createAnchor({ href: 'http://[' })],
    [
      'a cross-origin href',
      createAnchor({ href: 'https://other.example/pricing' }),
    ],
    ['a download', createAnchor({ href: '/guide.pdf', download: '' })],
    ['a top frame target', createAnchor({ href: '/pricing', target: '_top' })],
    [
      'a parent frame target',
      createAnchor({ href: '/pricing', target: '_parent' }),
    ],
    [
      'a new browsing context',
      createAnchor({ href: '/pricing', target: '_blank' }),
    ],
    [
      'an opted-out anchor',
      createAnchor({ href: '/pricing', 'data-no-fast-link': '' }),
    ],
  ])('leaves %s to native behavior', (_, anchor) => {
    expect(resolveFastLink(createPointerEvent(), anchor)).toBeNull();
  });

  it.each([
    ['button', 'anchor'],
    ['button', 'descendant'],
    [' button ', 'anchor'],
    [' button ', 'descendant'],
    ['button link', 'anchor'],
    ['button link', 'descendant'],
    ['future-button button', 'anchor'],
    ['future-button button', 'descendant'],
    ['command button', 'anchor'],
    ['command button', 'descendant'],
    ['BUTTON', 'anchor'],
  ])('leaves role=%j native for a press on the %s', (role, targetKind) => {
    const anchor = createAnchor({ href: '/menu', role });
    const label = anchor.appendChild(document.createElement('span'));
    const target = targetKind === 'anchor' ? anchor : label;

    expect(resolveFastLink(createPointerEvent({ target }), anchor)).toBeNull();
  });

  it.each([
    'link button',
    'future-role link',
    'checkbox',
    'presentation',
    'future-role',
    '\u00a0link',
  ])('leaves other anchor roles native: %j', (role) => {
    const anchor = createAnchor({ href: '/menu', role });
    const child = anchor.appendChild(document.createElement('span'));

    expect(
      resolveFastLink(createPointerEvent({ target: child }), anchor),
    ).toBeNull();
  });

  it.each(['', ' \t\n\f\r ', 'link', ' LINK\t'])(
    'accepts an empty or link anchor role: %j',
    (role) => {
      const anchor = createAnchor({ href: '/pricing', role });
      expect(resolveFastLink(createPointerEvent(), anchor)).not.toBeNull();
    },
  );

  it('allows target="_self"', () => {
    const anchor = createAnchor({ href: '/pricing', target: '_self' });

    expect(resolveFastLink(createPointerEvent(), anchor)).not.toBeNull();
  });

  it.each([
    ['button', '<button><span>Copy</span></button>'],
    ['input', '<input>'],
    ['label', '<label><span>Label</span></label>'],
    ['select', '<select><option>One</option></select>'],
    ['summary', '<summary><span>Details</span></summary>'],
    ['textarea', '<textarea></textarea>'],
    ['button role', '<div role="button"><span>Menu</span></div>'],
    ['padded button role', '<div role=" button "><span>Menu</span></div>'],
    ['later button token', '<div role="link button"><span>Menu</span></div>'],
    [
      'mixed-case button token',
      '<div role="link\tBUTTON"><span>Menu</span></div>',
    ],
    [
      'button with fallback role',
      '<div role="button link"><span>Menu</span></div>',
    ],
    [
      'button after an unsupported role',
      '<div role="future-button button"><span>Menu</span></div>',
    ],
    [
      'button after an abstract role',
      '<div role="command button"><span>Menu</span></div>',
    ],
    [
      'opted-out descendant',
      '<span data-no-fast-link><span>Handle</span></span>',
    ],
  ])('leaves a press inside a nested %s to native behavior', (_, markup) => {
    const anchor = createAnchor({ href: '/card' });
    anchor.innerHTML = markup;
    const content = anchor.querySelectorAll('span, option');
    const target = content.item(content.length - 1) ?? anchor.firstElementChild;

    expect(resolveFastLink(createPointerEvent({ target }), anchor)).toBeNull();
  });

  it.each([
    '<h2>Pricing</h2>',
    '<span role="img">Icon</span>',
    '<span role="future-button">Label</span>',
    '<span role="buttonish">Label</span>',
  ])('accepts ordinary link content: %s', (markup) => {
    const anchor = createAnchor({ href: '/card' });
    anchor.innerHTML = markup;

    expect(
      resolveFastLink(
        createPointerEvent({ target: anchor.firstElementChild }),
        anchor,
      ),
    ).not.toBeNull();
  });
});

describe('findAnchor', () => {
  it('finds an anchor around a descendant', () => {
    const root = document.createElement('div');
    const anchor = root.appendChild(createAnchor({ href: '/pricing' }));
    const label = anchor.appendChild(document.createElement('span'));

    expect(findAnchor(label, root)).toBe(anchor);
  });

  it('includes an anchor boundary for single-link bindings', () => {
    const anchor = createAnchor({ href: '/pricing' });
    const label = anchor.appendChild(document.createElement('span'));

    expect(findAnchor(label, anchor)).toBe(anchor);
  });

  it('does not walk above a non-anchor boundary', () => {
    const outerAnchor = createAnchor({ href: '/outside' });
    const boundary = outerAnchor.appendChild(document.createElement('div'));
    const label = boundary.appendChild(document.createElement('span'));

    expect(findAnchor(label, boundary)).toBeNull();
  });

  it('returns null when the boundary is not an ancestor', () => {
    const outsideAnchor = createAnchor({ href: '/outside' });
    const label = outsideAnchor.appendChild(document.createElement('span'));
    const boundary = document.createElement('div');

    expect(findAnchor(label, boundary)).toBeNull();
  });

  it('finds an HTML ancestor through an SVG anchor without crossing the boundary', () => {
    const root = document.createElement('div');
    const anchor = root.appendChild(createAnchor({ href: '/pricing' }));
    const svg = anchor.appendChild(
      document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
    );
    svg.innerHTML = '<a><text>Pricing</text></a>';
    const label = svg.querySelector('text');

    expect(findAnchor(label, root)).toBe(anchor);
    expect(findAnchor(label, null)).toBe(anchor);
    expect(findAnchor(label, svg)).toBeNull();
  });

  it('keeps non-element targets and boundaries outside the element tree native', () => {
    const anchor = createAnchor({ href: '/pricing' });
    const label = anchor.appendChild(document.createTextNode('Pricing'));
    expect(findAnchor(label, null)).toBeNull();
    expect(findAnchor(anchor, document)).toBeNull();
  });
});

it('deduplicates a non-extensible event through the shared WeakSet fallback', () => {
  const anchor = createAnchor({ href: '/pricing' });
  const event = createPointerEvent();
  Object.preventExtensions(event);
  expect(resolveFastLink(event, anchor)).not.toBeNull();
  expect(resolveFastLink(event, anchor)).toBeNull();
});
