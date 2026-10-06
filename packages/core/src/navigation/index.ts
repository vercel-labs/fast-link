import type { FastLinkIntent } from '../interaction';

/** Uses the adapter's route with an optional scroll override. */
export type FastRouterDecision = Readonly<{
  kind: 'router';
  scroll?: boolean;
}>;

/** Loads the validated URL in the source anchor's window. */
export type FastDocumentDecision = Readonly<{
  kind: 'document';
  method: 'assign' | 'replace';
}>;

/** Chooses router or document navigation without changing the destination. */
export type FastNavigationDecision = FastRouterDecision | FastDocumentDecision;

/**
 * Selects and runs navigation synchronously for an accepted Fast Link intent.
 * The caller must claim the press before calling this function.
 *
 * - With no policy, uses `defaultRouterDecision`.
 * - Decisions accept only documented fields. Omitted `scroll` keeps the
 *   adapter's scroll behavior.
 * - Policy errors and invalid decisions skip observation, attempt
 *   `location.assign()` with the URL captured before policy, and rethrow the error.
 *   If fallback navigation also throws, combines both errors in an `AggregateError`.
 * - Calls the observer with a frozen decision before navigation. Navigation
 *   still runs if the observer throws.
 * - Router errors are rethrown without document fallback.
 * - If observation and navigation both throw, combines both errors in an
 *   `AggregateError`.
 */
export function runFastNavigation(
  intent: FastLinkIntent,
  options: {
    defaultRouterDecision: FastRouterDecision;
    policy?: () => FastNavigationDecision;
    observe?: (decision: FastNavigationDecision) => void;
    route: (decision: FastRouterDecision) => void;
  },
): void {
  const destination = intent.url.href;
  const location = intent.anchor.ownerDocument.defaultView?.location;
  let decision: FastNavigationDecision;
  try {
    decision = validateDecision(
      options.policy === undefined
        ? options.defaultRouterDecision
        : options.policy(),
    );
  } catch (error) {
    try {
      location?.assign(destination);
    } catch (navigationError) {
      // oxlint-disable-next-line preserve-caught-error -- AggregateError retains both original errors.
      throw new AggregateError(
        [error, navigationError],
        'Policy and fallback navigation failed',
      );
    }
    throw error;
  }

  const errors: unknown[] = [];
  try {
    options.observe?.(decision);
  } catch (error) {
    errors.push(error);
  }
  try {
    if (decision.kind === 'router') options.route(decision);
    else location?.[decision.method](destination);
  } catch (error) {
    errors.push(error);
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, 'Observation and navigation failed');
}

function validateDecision(value: unknown): FastNavigationDecision {
  if (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object Object]' &&
    typeof Reflect.get(value, 'then') !== 'function'
  ) {
    const keys = Reflect.ownKeys(value);
    const kind = Reflect.get(value, 'kind');
    if (
      kind === 'router' &&
      keys.every((key) => key === 'kind' || key === 'scroll')
    ) {
      const scroll: unknown = Reflect.get(value, 'scroll');
      if (scroll === undefined) return Object.freeze({ kind });
      if (typeof scroll === 'boolean') return Object.freeze({ kind, scroll });
    }
    if (
      kind === 'document' &&
      keys.every((key) => key === 'kind' || key === 'method')
    ) {
      const method: unknown = Reflect.get(value, 'method');
      if (method === 'assign' || method === 'replace')
        return Object.freeze({ kind, method });
    }
  }
  throw new TypeError('Invalid Fast Navigation decision');
}
