import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom lacks the browser APIs the carousel, columns and motion rely on.
let reducedMotion = false;
export const setReducedMotion = (on: boolean) => {
  reducedMotion = on;
};

window.matchMedia = (query: string) =>
  ({
    matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  }) as MediaQueryList;

class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.ResizeObserver ??= Observer as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= Observer as unknown as typeof IntersectionObserver;
Element.prototype.scrollTo ??= function () {};
Element.prototype.scrollIntoView ??= function () {};
