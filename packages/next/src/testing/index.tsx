import Link from 'next/link';
import type { JSX } from 'react';

import { useFastLink } from '../use-fast-link';

export { router, routing } from './setup';

/**
 * Dispatches `pointerdown` with the given pointer type and event options.
 * Defaults to a cancelable primary mouse press.
 */
export function pointerDown(
  anchor: Element,
  pointerType = 'mouse',
  extra: MouseEventInit = {},
): void {
  const event = new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...extra,
  });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  anchor.dispatchEvent(event);
}

/** Test renderer that exposes its anchor to the capture binding. */
export function HookLink(
  options: import('../use-fast-link').UseFastLinkOptions,
): JSX.Element {
  const attach = useFastLink(options);
  return (
    <Link href={options.href} {...attach}>
      Custom
    </Link>
  );
}

/**
 * Resolves the anchor against `https://example.com/` and replaces its window's
 * location methods. Listener methods stay on the real document and window.
 */
export function stubLocation(
  anchor: HTMLElement,
  methods: Partial<Pick<Location, 'assign' | 'replace'>>,
): void {
  Object.defineProperty(anchor, 'ownerDocument', {
    value: {
      baseURI: 'https://example.com/',
      addEventListener: document.addEventListener.bind(document),
      removeEventListener: document.removeEventListener.bind(document),
      defaultView: {
        MouseEvent,
        addEventListener: window.addEventListener.bind(window),
        removeEventListener: window.removeEventListener.bind(window),
        location: { origin: 'https://example.com', ...methods },
      },
    },
  });
}

/**
 * Reports `document` and `window` listener types added after the call and not
 * yet removed. A pending gesture keeps its cancellation listeners until core
 * consumes or discards its preparation.
 */
export function trackListeners(): { live(): string[]; restore(): void } {
  const spies = [document, window].map((target) => ({
    add: vi.spyOn(target, 'addEventListener'),
    remove: vi.spyOn(target, 'removeEventListener'),
  }));
  return {
    live: () =>
      spies.flatMap(({ add, remove }) => {
        const removed = [...remove.mock.calls];
        return add.mock.calls.flatMap(([type, listener, options]) => {
          const index = removed.findIndex(
            (call) =>
              call[0] === type &&
              call[1] === listener &&
              isCapture(call[2]) === isCapture(options),
          );
          if (index === -1) return [type];
          removed.splice(index, 1);
          return [];
        });
      }),
    restore() {
      for (const { add, remove } of spies) {
        add.mockRestore();
        remove.mockRestore();
      }
    },
  };
}

function isCapture(options?: boolean | EventListenerOptions): boolean {
  return typeof options === 'boolean' ? options : Boolean(options?.capture);
}

/** Collects synchronous window error events during `action`. */
export function captureErrors(action: () => void): unknown[] {
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => {
    errors.push(event.error);
    event.preventDefault();
  };
  window.addEventListener('error', onError);
  try {
    action();
  } finally {
    window.removeEventListener('error', onError);
  }
  return errors;
}
