/**
 * The board's orchestrated entrance runs once per unlock. Rows that mount later (moving to
 * Completed, a new item) must not replay it, so components check this flag.
 */
let entering = true;
let timer: number | undefined;

export const isEntering = (): boolean => entering;

export function startEntrance(ms = 1080): void {
  entering = true;
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    entering = false;
  }, ms);
}
