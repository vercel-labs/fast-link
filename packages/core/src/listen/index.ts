/** Adds a listener and returns a function that removes it with the same capture flag. */
export function listen<K extends keyof GlobalEventHandlersEventMap>(
  target: EventTarget,
  type: K,
  listener: (event: GlobalEventHandlersEventMap[K]) => void,
  capture = false,
): () => void {
  const handler = listener as EventListener;
  target.addEventListener(type, handler, capture);
  return () => target.removeEventListener(type, handler, capture);
}
