import { createFastLink } from '../index';

afterEach(() => {
  document.body.replaceChildren();
});

describe('createFastLink in a browser', () => {
  it('navigates on pointerdown and preserves click propagation', () => {
    const root = document.body.appendChild(document.createElement('div'));
    const anchor = root.appendChild(document.createElement('a'));
    anchor.href = '/pricing';
    anchor.textContent = 'Pricing';
    const events: string[] = [];
    const onDocumentCapture = (): void => {
      events.push('document-capture');
    };
    const onAnchorClick = (): void => {
      events.push('anchor-click');
    };
    const onDocumentBubble = (): void => {
      events.push('document-bubble');
    };
    document.addEventListener('click', onDocumentCapture, { capture: true });
    anchor.addEventListener('click', onAnchorClick);
    document.addEventListener('click', onDocumentBubble);
    const fastLink = createFastLink(root, {
      navigate: () => events.push('navigate'),
    });

    try {
      anchor.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerType: 'mouse',
        }),
      );
      expect(events).toEqual(['navigate']);

      anchor.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          button: 0,
          pointerType: 'mouse',
        }),
      );
      const click = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        detail: 1,
      });

      expect(anchor.dispatchEvent(click)).toBe(false);
      expect(click.defaultPrevented).toBe(true);
      expect(events).toEqual([
        'navigate',
        'document-capture',
        'anchor-click',
        'document-bubble',
      ]);
    } finally {
      fastLink.destroy();
      document.removeEventListener('click', onDocumentCapture, {
        capture: true,
      });
      document.removeEventListener('click', onDocumentBubble);
    }
  });

  it('leaves touch, keyboard, and destroyed roots alone', () => {
    const anchor = document.body.appendChild(document.createElement('a'));
    anchor.href = '/pricing';
    const navigations: string[] = [];
    const fastLink = createFastLink(anchor, {
      navigate: () => navigations.push('navigate'),
    });

    anchor.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerType: 'touch',
      }),
    );
    anchor.dispatchEvent(
      new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }),
    );
    fastLink.destroy();
    anchor.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerType: 'mouse',
      }),
    );

    expect(navigations).toEqual([]);
  });
});
