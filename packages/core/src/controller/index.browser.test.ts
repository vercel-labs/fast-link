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

  it('leaves touch, detail-zero clicks, and destroyed roots native', () => {
    const anchor = document.body.appendChild(document.createElement('a'));
    anchor.href = '/pricing';
    const navigations: string[] = [];
    const prevented: boolean[] = [];
    anchor.addEventListener('click', (event) => {
      prevented.push(event.defaultPrevented);
      event.preventDefault();
    });
    const fastLink = createFastLink(anchor, {
      navigate: () => navigations.push('navigate'),
    });

    const click = (detail: number): void => {
      anchor.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, detail }),
      );
    };
    const press = (pointerType: string): void => {
      anchor.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerType,
        }),
      );
    };

    try {
      press('touch');
      click(1);
      expect(navigations).toEqual([]);

      press('mouse');
      click(0);
      click(1);
      fastLink.destroy();
      press('mouse');
      click(1);

      expect(navigations).toEqual(['navigate']);
      expect(prevented).toEqual([false, false, true, false]);
    } finally {
      fastLink.destroy();
    }
  });
});
