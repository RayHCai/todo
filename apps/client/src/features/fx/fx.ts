/** Full-page moments, fired from anywhere and drawn by <FxLayer>. */
export type FxEvent =
  { kind: "tick" } | { kind: "goal"; color: string; x: number; y: number } | { kind: "ripple"; x: number; y: number };

type Listener = (event: FxEvent) => void;
const listeners = new Set<Listener>();

export function emitFx(event: FxEvent): void {
  listeners.forEach((l) => l(event));
}

export function onFx(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const centerOf = (el: Element | null | undefined): { x: number; y: number } => {
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
