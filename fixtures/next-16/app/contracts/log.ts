import type {
  FastLinkIntent,
  FastNavigationDecision,
  FastNavigationPolicy,
} from '@fast-link/next';

const LOG_KEY = 'contracts-log';

type Handle = Record<string, (argument: never) => unknown>;

declare global {
  interface Window {
    __contracts?: Map<string, Handle>;
  }
}

/** Appends an entry that survives client and document navigation. */
export function record(entry: string): void {
  const log = JSON.parse(sessionStorage.getItem(LOG_KEY) ?? '[]') as string[];
  log.push(entry);
  sessionStorage.setItem(LOG_KEY, JSON.stringify(log));
}

/** Exposes test controls for one fixture element and returns its cleanup. */
export function registerHandle(id: string, handle: Handle): () => void {
  const handles = (window.__contracts ??= new Map());
  handles.set(id, handle);
  return () => {
    if (handles.get(id) === handle) handles.delete(id);
  };
}

/** Records each call, then selects router or document navigation. */
export function recordingPolicy(
  name: string,
  kind: 'router' | 'document' = 'router',
): FastNavigationPolicy {
  return () => {
    record(`${name}:policy`);
    return kind === 'router'
      ? { kind: 'router' }
      : { kind: 'document', method: 'assign' };
  };
}

export function recordingObserver(
  name: string,
): (intent: FastLinkIntent, decision: FastNavigationDecision) => void {
  return (_intent, decision) => record(`${name}:observe:${decision.kind}`);
}

export function recordingClick(
  name: string,
): (event: { defaultPrevented: boolean }) => void {
  return (event) =>
    record(`${name}:click:${event.defaultPrevented ? 'prevented' : 'allowed'}`);
}
