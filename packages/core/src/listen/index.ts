/** Adds a listener and returns a function that removes it with the same capture flag. */
export function listen<E extends Event>(
  target: EventTarget,
  type: string,
  listener: (event: E) => void,
  capture = false,
): () => void {
  const handler = listener as EventListener;
  target.addEventListener(type, handler, capture);
  return () => target.removeEventListener(type, handler, capture);
}
