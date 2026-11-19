import { getLinkIntent, type FastLinkIntent } from '../interaction';
import { listen } from '../listen';
import { createClickGesture } from '../preparation/gesture';
import {
  armFollowupClick,
  suppressFollowupClick,
  type FollowupClaim,
} from './followup-click';
import {
  isInteractionOwner,
  registerInteractionRoot,
  resolvePressForRoot,
} from './ownership';
import type {
  ImmediateLinkOptions,
  LinkInteractionController,
  LinkInteractionOptions,
  SelectedPath,
} from './types';

export type {
  LinkInteractionController,
  LinkInteractionOptions,
  LinkMode,
} from './types';

/**
 * Handles eligible primary mouse input on one root in the selected mode:
 *
 * - `release` prepares on press; the adapter accepts the matching click.
 * - `immediate` navigates on press and suppresses the follow-up click.
 * - `native` leaves new interactions to ordinary link behavior.
 *
 * A managed anchor keeps its own mode over every containing root. Otherwise the
 * closest root containing the link owns it, including a native root. The root
 * registers at creation; call `destroy()` when it detaches.
 *
 * @param isActive Reports whether the root is still attached for its owner.
 *   While it returns `false`, a press stays native and arms no suppression;
 *   suppression armed earlier still applies. A guard that deactivates the root
 *   cancels immediate navigation but keeps its click suppressed, and release
 *   `matchClick` and `consume()` return `null`. Defaults to always active.
 */
export function createLinkInteraction<P>(
  root: HTMLElement,
  options: LinkInteractionOptions<P>,
  isActive: () => boolean = () => true,
): LinkInteractionController<P> {
  let selected = selectPath(root, options, isActive);
  let isDestroyed = false;
  // Changes on each root press, mode change, and destruction to invalidate a running guard.
  let inputVersion = 0;
  // Survives mode and option changes until its click, the next root press, or destruction.
  let followup: FollowupClaim | null = null;
  const releaseRoot = registerInteractionRoot(root);
  const stopListening = listen(root, 'pointerdown', startInteraction, true);

  function startInteraction(event: PointerEvent): void {
    finishPreviousInput();
    const current = selected;
    if (isDestroyed || current.mode === 'native' || !isActive()) return;

    const intent = resolvePressForRoot(root, event);
    if (!intent) return;
    if (current.mode === 'release') {
      current.gesture.prepare(event, intent);
      return;
    }
    navigateOnPress(event, intent, current.options);
  }

  /**
   * Immediate mode: arm suppression before user code, run the guard, then
   * navigate with inputs that are still current. Guard and navigation errors
   * propagate; suppression stays armed after every outcome.
   */
  function navigateOnPress(
    event: PointerEvent,
    intent: FastLinkIntent,
    pressOptions: ImmediateLinkOptions,
  ): void {
    followup = armFollowupClick(root, intent.anchor);
    const attempt = inputVersion;
    if (pressOptions.beforeNavigate?.(intent) === false) return;

    const current = resolveCurrentPress(event, intent.anchor, attempt);
    if (!current) return;
    current.options.navigate(current.intent);
  }

  /**
   * Rechecks the attempt after the guard. New root input, a mode change,
   * destruction, or deactivation invalidates it; same-mode option and href
   * changes apply.
   */
  function resolveCurrentPress(
    event: PointerEvent,
    anchor: HTMLAnchorElement,
    attempt: number,
  ): { intent: FastLinkIntent; options: ImmediateLinkOptions } | null {
    const current = selected;
    if (isDestroyed || inputVersion !== attempt || !isActive()) return null;
    if (current.mode !== 'immediate') return null;
    if (!isInteractionOwner(root, anchor)) return null;

    const intent = getLinkIntent(event.target, anchor);
    return intent ? { intent, options: current.options } : null;
  }

  // A new root press settles earlier suppression and invalidates a running guard in every mode.
  function finishPreviousInput(): void {
    inputVersion++;
    followup?.settle();
    followup = null;
    discard();
  }

  function discard(): void {
    if (selected.mode === 'release') selected.gesture.discard();
  }

  function leaveSelectedPath(): void {
    if (selected.mode === 'release') selected.gesture.destroy();
  }

  return {
    update(nextOptions) {
      if (isDestroyed) return;
      const current = selected;
      if (current.mode === 'release' && nextOptions.mode === 'release') {
        current.gesture.update(nextOptions);
        return;
      }
      if (current.mode === 'immediate' && nextOptions.mode === 'immediate') {
        current.options = { ...nextOptions };
        return;
      }
      // Native to native has no options to replace.
      if (current.mode === nextOptions.mode) return;

      // Switching away and back cannot revive discarded work. Suppression is kept.
      inputVersion++;
      leaveSelectedPath();
      selected = selectPath(root, nextOptions, isActive);
    },
    matchClick: (event) =>
      !isDestroyed && selected.mode === 'release'
        ? selected.gesture.matchClick(event)
        : null,
    suppressClick: (event) =>
      !isDestroyed && suppressFollowupClick(root, followup, event),
    discard,
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      finishPreviousInput();
      leaveSelectedPath();
      stopListening();
      releaseRoot();
    },
  };
}

// Constructs only the selected path; native constructs neither active path.
function selectPath<P>(
  root: HTMLElement,
  options: LinkInteractionOptions<P>,
  isActive: () => boolean,
): SelectedPath<P> {
  if (options.mode === 'release') {
    return {
      mode: 'release',
      gesture: createClickGesture(
        root,
        options,
        (anchor) => isInteractionOwner(root, anchor),
        isActive,
      ),
    };
  }
  if (options.mode === 'immediate') {
    return { mode: 'immediate', options: { ...options } };
  }
  return { mode: 'native' };
}
