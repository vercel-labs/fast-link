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
