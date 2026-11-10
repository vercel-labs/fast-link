import {
  createClickPreparation,
  type ClickPreparationController,
  type ClickPreparationOptions,
  type PreparedClick,
} from '@fast-link/core';
import type { ForwardedRef } from 'react';

/** Owns preparation and caller refs across attachment, committed updates, and effect replay. */
export function createPreparationBinding<P, T extends HTMLElement>(
  initialOptions: ClickPreparationOptions<P>,
  initialRef: ForwardedRef<T>,
): {
  handlers: {
    ref(element: T | null): void;
    matchClick(event: MouseEvent): PreparedClick<P> | null;
    discard(): void;
  };
  mount(): () => void;
  update(
    options: ClickPreparationOptions<P>,
    forwardedRef: ForwardedRef<T>,
  ): void;
} {
  let options = initialOptions;
  let forwardedRef = initialRef;
  let element: T | null = null;
  let preparation: {
    root: T;
    controller: ClickPreparationController<P>;
  } | null = null;
  let refCleanup: (() => void) | undefined;

  function ensureController(): void {
    if (!element || preparation) return;
    preparation = {
      root: element,
      controller: createClickPreparation(element, options),
    };
  }

  function destroyController(): void {
    preparation?.controller.destroy();
    preparation = null;
  }

  function detachRef(): void {
    refCleanup?.();
    refCleanup = undefined;
  }

  function ref(nextElement: T | null): void {
    if (element === nextElement) return;
    if (nextElement && preparation?.root !== nextElement) destroyController();
    detachRef();
    element = nextElement;

    if (!element) {
      // Next Link can reattach the same anchor during a commit. Preserve its
      // gesture until then; matchClick rejects activation while detached.
      queueMicrotask(() => {
        if (!element) destroyController();
      });
      return;
    }

    refCleanup = attachRef(forwardedRef, element);
    ensureController();
  }

  function update(
    nextOptions: ClickPreparationOptions<P>,
    nextRef: ForwardedRef<T>,
  ): void {
    const refChanged = forwardedRef !== nextRef;
    options = nextOptions;
    forwardedRef = nextRef;
    // Caller refs can dispatch events. Publish options before replacing them.
    preparation?.controller.update(options);
    if (!element || !refChanged) return;
    detachRef();
    refCleanup = attachRef(forwardedRef, element);
  }

  function matchClick(event: MouseEvent): PreparedClick<P> | null {
    if (!element) {
      preparation?.controller.discard();
      return null;
    }
    const candidate = preparation?.controller.matchClick(event);
    if (!candidate) return null;
    return {
      consume() {
        // A guard may detach the root before deferred controller cleanup.
        if (!element) {
          candidate.discard();
          return null;
        }
        return candidate.consume();
      },
      discard: candidate.discard,
    };
  }

  return {
    handlers: {
      ref,
      matchClick,
      discard: () => preparation?.controller.discard(),
    },
    update,
    mount() {
      // Strict Mode replays effect cleanup while retaining the DOM element.
      ensureController();
      return destroyController;
    },
  };
}

function attachRef<T>(
  ref: ForwardedRef<T>,
  element: T,
): (() => void) | undefined {
  if (typeof ref === 'function') {
    const cleanup = ref(element);
    return typeof cleanup === 'function' ? cleanup : () => ref(null);
  }
  if (!ref) return;
  ref.current = element;
  return () => {
    ref.current = null;
  };
}
