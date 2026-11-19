import { createClickGesture } from '../preparation/gesture';
import { suppressFollowupClick } from './followup-click';
import {
  isInteractionOwner,
  registerInteractionRoot,
  resolvePressForRoot,
} from './ownership';
import { navigateOnPress } from './press';
import type {
  InteractionState,
  LinkInteractionController,
  LinkInteractionOptions,
  SelectedPath,
} from './state';

export type {
  LinkInteractionController,
  LinkInteractionOptions,
  LinkMode,
} from './state';

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
 */
export function createLinkInteraction<P>(
  root: HTMLElement,
  options: LinkInteractionOptions<P>,
): LinkInteractionController<P> {
  const state: InteractionState<P> = {
    root,
    selected: selectPath(root, options),
    destroyed: false,
    inputVersion: 0,
    followup: null,
  };
  const releaseRoot = registerInteractionRoot(root);
  const onPointerDown = (event: PointerEvent) => startInteraction(state, event);
  root.addEventListener('pointerdown', onPointerDown, true);

  return {
    update: (nextOptions) => updateInteraction(state, nextOptions),
    matchClick: (event) =>
      !state.destroyed && state.selected.mode === 'release'
        ? state.selected.gesture.matchClick(event)
        : null,
    suppressClick: (event) =>
      !state.destroyed && suppressFollowupClick(root, state.followup, event),
    discardClick() {
      if (state.selected.mode === 'release') state.selected.gesture.discard();
    },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      finishPreviousInput(state);
      leaveSelectedPath(state);
      root.removeEventListener('pointerdown', onPointerDown, true);
      releaseRoot();
    },
  };
}

function startInteraction<P>(
  state: InteractionState<P>,
  event: PointerEvent,
): void {
  finishPreviousInput(state);
  const { selected } = state;
  if (state.destroyed || selected.mode === 'native') return;

  const intent = resolvePressForRoot(state.root, event);
  if (!intent) return;
  if (selected.mode === 'release') {
    selected.gesture.prepare(event, intent);
    return;
  }
  navigateOnPress(state, event, intent, selected.options);
}

// A new root press settles earlier suppression and invalidates a running guard in every mode.
function finishPreviousInput<P>(state: InteractionState<P>): void {
  state.inputVersion++;
  state.followup?.settle();
  state.followup = null;
  if (state.selected.mode === 'release') state.selected.gesture.discard();
}

function updateInteraction<P>(
  state: InteractionState<P>,
  options: LinkInteractionOptions<P>,
): void {
  if (state.destroyed) return;
  const { selected } = state;
  if (selected.mode === 'release' && options.mode === 'release') {
    selected.gesture.update(options);
    return;
  }
  if (selected.mode === 'immediate' && options.mode === 'immediate') {
    selected.options = { ...options };
    return;
  }
  if (selected.mode === options.mode) return;

  // Switching away and back cannot revive discarded work. Suppression is kept.
  state.inputVersion++;
  leaveSelectedPath(state);
  state.selected = selectPath(state.root, options);
}

function leaveSelectedPath<P>(state: InteractionState<P>): void {
  if (state.selected.mode === 'release') state.selected.gesture.destroy();
}

// Constructs only the selected path; native constructs neither active path.
function selectPath<P>(
  root: HTMLElement,
  options: LinkInteractionOptions<P>,
): SelectedPath<P> {
  if (options.mode === 'release') {
    return {
      mode: 'release',
      gesture: createClickGesture(root, options, (anchor) =>
        isInteractionOwner(root, anchor),
      ),
    };
  }
  if (options.mode === 'immediate') {
    return { mode: 'immediate', options: { ...options } };
  }
  return { mode: 'native' };
}
