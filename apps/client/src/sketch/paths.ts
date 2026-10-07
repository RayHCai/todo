/**
 * Hand-drawn marker strokes: jittered points joined by soft quadratic curves.
 * Every generator takes a seed so a stroke looks the same on every render.
 */

export type Pt = readonly [number, number];
export type Rand = () => number;

/** Mulberry32 seeded from a string. */
export function rng(seed: string): Rand {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n: number) => n.toFixed(1);

export function wob(points: readonly Pt[], r: Rand, a = 1): string {
  const j = (n: number) => n + (r() * 2 - 1) * a;
  let d = "";
  points.forEach(([x, y], i) => {
    if (i === 0) {
      d += `M${f(j(x))} ${f(j(y))}`;
      return;
    }
    const [px, py] = points[i - 1]!;
    const cx = (px + x) / 2 + (r() * 2 - 1) * a * 1.3;
    const cy = (py + y) / 2 + (r() * 2 - 1) * a * 1.3;
    d += ` Q${f(cx)} ${f(cy)} ${f(j(x))} ${f(j(y))}`;
  });
  return d;
}

/** A rectangle drawn in one pass that slightly overshoots where it closes. */
export const rect = (w: number, h: number, r: Rand, pad = 2, a = 1): string =>
  wob(
    [
      [pad, pad],
      [w - pad, pad],
      [w - pad, h - pad],
      [pad, h - pad],
      [pad, pad - 2],
    ],
    r,
    a,
  );

/** An ellipse, optionally partial (`sweep` < 2π) or overshooting (`sweep` > 2π). */
export function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  r: Rand,
  { a = 0.8, n = 14, start = -1.9, sweep = Math.PI * 2 + 0.35 } = {},
): string {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = start + (sweep * i) / n;
    pts.push([cx + (rx + (r() * 2 - 1) * a) * Math.cos(t), cy + (ry + (r() * 2 - 1) * a) * Math.sin(t)]);
  }
  return wob(pts, r, a * 0.4);
}

export function line(x1: number, y1: number, x2: number, y2: number, r: Rand, { a = 1, n = 8, wave = 0 } = {}): string {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    pts.push([x1 + (x2 - x1) * k, y1 + (y2 - y1) * k + Math.sin(i * 1.4) * wave]);
  }
  return wob(pts, r, a);
}

/** A check mark in a 16×16 box, scaled by `s`. */
export const tick = (r: Rand, s = 1): string =>
  wob(
    [
      [3.5 * s, 8.5 * s],
      [6.8 * s, 12.2 * s],
      [13.5 * s, 3.8 * s],
    ],
    r,
    0.5 * s,
  );

export const arc = (cx: number, cy: number, rad: number, a0: number, a1: number, n = 8): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = a0 + ((a1 - a0) * i) / n;
    return [cx + rad * Math.cos(t), cy + rad * Math.sin(t)] as const;
  });
