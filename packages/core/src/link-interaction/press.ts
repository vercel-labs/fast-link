import { getLinkIntent, type FastLinkIntent } from '../interaction';
import { armFollowupClick } from './followup-click';
import { isInteractionOwner } from './ownership';
import type { ImmediateLinkOptions, InteractionState } from './state';

/**
 * Immediate mode: arm suppression before user code, run the guard, then
 * navigate with inputs that are still current. Guard and navigation errors
 * propagate; suppression stays armed after every outcome.
 */
export function navigateOnPress<P>(
  state: InteractionState<P>,
  event: PointerEvent,
  intent: FastLinkIntent,
  options: ImmediateLinkOptions,
): void {
  state.followup = armFollowupClick(state.root, intent.anchor);
  const attempt = state.inputVersion;
  if (options.beforeNavigate?.(intent) === false) return;

  const current = resolveCurrentPress(state, event, intent.anchor, attempt);
  if (!current) return;
  current.options.navigate(current.intent);
}

/**
 * Rechecks the attempt after the guard. New root input, a mode change, or
 * destruction invalidates it; same-mode option and href changes apply.
 */
function resolveCurrentPress<P>(
  state: InteractionState<P>,
  event: PointerEvent,
  anchor: HTMLAnchorElement,
  attempt: number,
): { intent: FastLinkIntent; options: ImmediateLinkOptions } | null {
  const { root, selected } = state;
  if (state.destroyed || state.inputVersion !== attempt) return null;
  if (selected.mode !== 'immediate') return null;
  if (!root.contains(anchor) || !isInteractionOwner(root, anchor)) return null;

  const intent = getLinkIntent(event.target, anchor);
  return intent ? { intent, options: selected.options } : null;
}
