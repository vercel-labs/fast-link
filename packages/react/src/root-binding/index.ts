import type { PreparedClick } from '@fast-link/core';
import { useLayoutEffect, useState, type ForwardedRef } from 'react';

/** The controller surface the root binding manages. */
interface RootController<P, O> {
  update(options: O): void;
  matchClick(event: MouseEvent): PreparedClick<P> | null;
  discard(): void;
  destroy(): void;
}

/** One React-owned root and its controller. */
export interface RootBinding<P, C, T extends HTMLElement> {
  /** Stable handlers shared by both hooks. */
  handlers: {
    ref(element: T | null): void;
    /** Returns `null` without a controller; the controller rejects detached activation. */
    matchClick(event: MouseEvent): PreparedClick<P> | null;
    discard(): void;
  };
  /** The controller, retained while a detached ref may reattach in the same commit. */
  controller(): C | null;
}

/**
 * Binds one controller to the element receiving `handlers.ref`.
 *
 * - Creates the controller when the ref attaches, including when React replays
 *   refs for Strict Mode or a revealed `<Activity>`.
 * - Publishes committed options after every commit, before replacing a changed
 *   caller ref.
 * - Reattaching the same element keeps the controller and its pending work.
 * - Replacing the element, staying detached after the commit, or unmounting
 *   destroys it.
 * - Passes `isAttached` to the factory, whose controller rejects input and
 *   activation while the ref is detached.
 *
 * The binding renders nothing. React 19 runs no layout effects during server
 * rendering and does not warn about them.
 */
export function useRootBinding<
  P,
  O,
  C extends RootController<P, O>,
  T extends HTMLElement,
>(
  createController: (root: T, options: O, isAttached: () => boolean) => C,
  options: O,
  forwardedRef: ForwardedRef<T>,
): RootBinding<P, C, T> {
  const [binding] = useState(() =>
    createRootBinding<P, O, C, T>(createController, options, forwardedRef),
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
  C extends RootController<P, O>,
  T extends HTMLElement,
>(
  createController: (root: T, options: O, isAttached: () => boolean) => C,
  initialOptions: O,
  initialRef: ForwardedRef<T>,
) {
  let options = initialOptions;
  let forwardedRef = initialRef;
  let element: T | null = null;
  // The element that owns the controller, kept across a transient detach.
  let root: T | null = null;
  let controller: C | null = null;
  let refCleanup: (() => void) | undefined;
  const isAttached = () => element !== null;
  const discard = () => controller?.discard();

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
    const isReplacement = nextElement !== null && root !== nextElement;
    if (isReplacement) destroyController();
    // Record the detachment first: caller ref cleanup can dispatch input.
    element = nextElement;
    replaceRef();

    if (element) {
      if (controller) return;
      root = element;
      controller = createController(element, options, isAttached);
      return;
    }
    // Renderers such as Next Link can reattach the same element within one
    // commit. Keep pending work until then; activation is rejected meanwhile.
    queueMicrotask(() => {
      if (!element) destroyController();
    });
  }

  return {
    handlers: {
      ref,
      matchClick: (event: MouseEvent) => controller?.matchClick(event) ?? null,
      discard,
    },
    controller: () => controller,
    update(nextOptions: O, nextRef: ForwardedRef<T>): void {
      const isRefChanged = forwardedRef !== nextRef;
      options = nextOptions;
      forwardedRef = nextRef;
      // Caller refs can dispatch input. Publish options before replacing them.
      controller?.update(options);
      if (isRefChanged) replaceRef();
    },
    // Unmount destroys synchronously. Hidden `<Activity>` and Strict Mode replay
    // also detach the ref, which re-creates the controller when it reattaches.
    mount: () => destroyController,
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
