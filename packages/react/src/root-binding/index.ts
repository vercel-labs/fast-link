import type { PreparedClick } from '@fast-link/core';
import { useLayoutEffect, useState, type ForwardedRef } from 'react';

/** The controller surface the root binding manages. */
type RootController<P, O, K extends string> = {
  update(options: O): void;
  matchClick(event: MouseEvent): PreparedClick<P> | null;
  destroy(): void;
} & Record<K, () => void>;

/** One React-owned root and its controller. */
export interface RootBinding<P, C, T extends HTMLElement> {
  /** Stable handlers shared by both hooks. */
  handlers: {
    ref(element: T | null): void;
    /** Matches only while attached. A candidate consumed after detachment is discarded. */
    matchClick(event: MouseEvent): PreparedClick<P> | null;
    discard(): void;
  };
  /** The controller, retained while a detached ref may reattach in the same commit. */
  controller(): C | null;
}

/**
 * Binds one controller to the element receiving `handlers.ref`.
 *
 * - Creates the controller when the ref attaches. `isAttached` lets the factory
 *   reject activation while the ref is detached.
 * - Publishes committed options after every commit, before replacing a changed
 *   caller ref.
 * - Reattaching the same element keeps the controller and its pending work.
 * - Replacing the element, staying detached after the commit, or unmounting
 *   destroys it. Strict Mode replays effect cleanup while retaining the element.
 *
 * The binding renders nothing. React 19 runs no layout effects during server
 * rendering and does not warn about them.
 */
export function useRootBinding<
  P,
  O,
  K extends string,
  C extends RootController<P, O, K>,
  T extends HTMLElement,
>(
  createController: (
    root: T,
    options: O,
    isAttached: () => boolean,
  ) => C & { matchClick(event: MouseEvent): PreparedClick<P> | null },
  discardMethod: K,
  options: O,
  forwardedRef: ForwardedRef<T>,
): RootBinding<P, C, T> {
  const [binding] = useState(() =>
    createRootBinding(createController, discardMethod, options, forwardedRef),
  );
  useLayoutEffect(binding.mount, [binding]);
  useLayoutEffect(() => {
    binding.update(options, forwardedRef);
  });
  return binding;
}

function createRootBinding<
  P,
  O,
  K extends string,
  C extends RootController<P, O, K>,
  T extends HTMLElement,
>(
  createController: (
    root: T,
    options: O,
    isAttached: () => boolean,
  ) => C & { matchClick(event: MouseEvent): PreparedClick<P> | null },
  discardMethod: K,
  initialOptions: O,
  initialRef: ForwardedRef<T>,
) {
  let options = initialOptions;
  let forwardedRef = initialRef;
  let element: T | null = null;
  let root: T | null = null;
  let controller: C | null = null;
  let refCleanup: (() => void) | undefined;
  const isAttached = () => element !== null;
  const discard = () => controller?.[discardMethod]();

  function ensureController(): void {
    if (element && !controller) {
      controller = createController((root = element), options, isAttached);
    }
  }

  function destroyController(): void {
    controller?.destroy();
    controller = root = null;
  }

  // Runs the previous caller ref's cleanup, then assigns the current element.
  function replaceRef(): void {
    refCleanup?.();
    refCleanup = element ? attachRef(forwardedRef, element) : undefined;
  }

  function ref(nextElement: T | null): void {
    if (element === nextElement) return;
    if (nextElement && root !== nextElement) destroyController();
    // Record the detachment first: caller ref cleanup can dispatch input.
    element = nextElement;
    replaceRef();

    if (element) {
      ensureController();
      return;
    }
    // Renderers such as Next Link can reattach the same element within one
    // commit. Keep pending work until then; activation is rejected meanwhile.
    queueMicrotask(() => {
      if (!element) destroyController();
    });
  }

  function matchClick(event: MouseEvent): PreparedClick<P> | null {
    if (!element) {
      discard();
      return null;
    }
    const candidate = controller?.matchClick(event);
    if (!candidate) return null;
    return {
      consume() {
        // A guard can detach the root before deferred cleanup.
        if (element) return candidate.consume();
        candidate.discard();
        return null;
      },
      discard: candidate.discard,
    };
  }

  return {
    handlers: { ref, matchClick, discard },
    controller: () => controller,
    update(nextOptions: O, nextRef: ForwardedRef<T>): void {
      const isRefChanged = forwardedRef !== nextRef;
      options = nextOptions;
      forwardedRef = nextRef;
      // Caller refs can dispatch input. Publish options before replacing them.
      controller?.update(options);
      if (isRefChanged) replaceRef();
    },
    mount() {
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
