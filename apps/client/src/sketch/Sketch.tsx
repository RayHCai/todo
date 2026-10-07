import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { arc, ellipse, line, rect, rng, tick, wob } from "./paths";

interface SvgProps {
  className?: string;
  style?: CSSProperties;
}

function Svg({
  w,
  h,
  children,
  className = "",
  style,
  stretch,
}: SvgProps & { w: number; h: number; children: ReactNode; stretch?: boolean }) {
  return (
    <svg
      className={`sk ${className}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio={stretch ? "none" : undefined}
      aria-hidden="true"
      focusable="false"
      style={style}
    >
      {children}
    </svg>
  );
}

/** Memoizes a set of path strings for a seed, so strokes never re-jitter on re-render. */
function usePaths(seed: string, make: (r: ReturnType<typeof rng>) => string[]): string[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `make` is a fresh closure each render; the seed alone decides the strokes
  return useMemo(() => make(rng(seed)), [seed]);
}

export function CalendarIcon(props: SvgProps) {
  const [a, b, c, d] = usePaths("cal", (r) => [
    rect(24, 24, r, 4, 0.7),
    wob(
      [
        [4, 10],
        [20, 10],
      ],
      r,
      0.5,
    ),
    wob(
      [
        [9, 2.5],
        [9, 7],
      ],
      r,
      0.4,
    ),
    wob(
      [
        [15, 2.5],
        [15, 7],
      ],
      r,
      0.4,
    ),
  ]);
  return (
    <Svg w={24} h={24} {...props}>
      <path d={a} />
      <path d={b} className="page" />
      <path d={c} />
      <path d={d} />
    </Svg>
  );
}

export function LockIcon(props: SvgProps) {
  const [body, shackle] = usePaths("lock", (r) => [
    wob(
      [
        [5, 10.5],
        [19, 10.5],
        [19, 20.5],
        [5, 20.5],
        [5, 9.5],
      ],
      r,
      0.5,
    ),
    wob(arc(12, 10.5, 4, Math.PI, Math.PI * 2, 8), r, 0.35),
  ]);
  return (
    <Svg w={24} h={24} {...props}>
      <path d={body} />
      <path d={shackle} className="shackle" />
    </Svg>
  );
}

export function PlusIcon(props: SvgProps) {
  const [a, b] = usePaths("plus", (r) => [
    wob(
      [
        [7, 1.5],
        [7, 12.5],
      ],
      r,
      0.4,
    ),
    wob(
      [
        [1.5, 7],
        [12.5, 7],
      ],
      r,
      0.4,
    ),
  ]);
  return (
    <Svg w={14} h={14} {...props}>
      <path d={a} />
      <path d={b} />
    </Svg>
  );
}

export function CloseIcon(props: SvgProps) {
  const [a, b] = usePaths("close", (r) => [
    wob(
      [
        [2.5, 2.5],
        [11.5, 11.5],
      ],
      r,
      0.4,
    ),
    wob(
      [
        [11.5, 2.5],
        [2.5, 11.5],
      ],
      r,
      0.4,
    ),
  ]);
  return (
    <Svg w={14} h={14} {...props}>
      <path d={a} />
      <path d={b} />
    </Svg>
  );
}

export function ChevronIcon({ dir, ...props }: SvgProps & { dir: "left" | "right" | "down" }) {
  const [d] = usePaths(`chev-${dir}`, (r) => [
    wob(
      dir === "left"
        ? [
            [9, 2.5],
            [4.5, 7],
            [9, 11.5],
          ]
        : dir === "right"
          ? [
              [5, 2.5],
              [9.5, 7],
              [5, 11.5],
            ]
          : [
              [2.5, 5],
              [7, 9.5],
              [11.5, 5],
            ],
      r,
      0.4,
    ),
  ]);
  return (
    <Svg w={14} h={14} {...props}>
      <path d={d} />
    </Svg>
  );
}

export function DotIcon({ seed, ...props }: SvgProps & { seed: string }) {
  const [d] = usePaths(`dot-${seed}`, (r) => [ellipse(4, 4, 2.8, 2.8, r, { a: 0.25, n: 8 })]);
  return (
    <Svg w={8} h={8} {...props}>
      <path d={d} />
    </Svg>
  );
}

export function NotesIcon(props: SvgProps) {
  const [a, b, c] = usePaths("notes", (r) => [
    wob(
      [
        [3, 3],
        [11, 3],
      ],
      r,
      0.3,
    ),
    wob(
      [
        [3, 7],
        [11, 7],
      ],
      r,
      0.3,
    ),
    wob(
      [
        [3, 11],
        [8, 11],
      ],
      r,
      0.3,
    ),
  ]);
  return (
    <Svg w={14} h={14} {...props}>
      <path d={a} />
      <path d={b} />
      <path d={c} />
    </Svg>
  );
}

/** A square (todo) or ring (goal) checkbox outline plus a tick that draws when `checked`. */
export function CheckMark({ seed, shape, ...props }: SvgProps & { seed: string; shape: "box" | "ring" }) {
  const [outline, t] = usePaths(`${shape}-${seed}`, (r) =>
    shape === "box"
      ? [rect(16, 16, r, 1.5, 0.6), tick(r)]
      : [ellipse(9, 9, 7.2, 7.2, r, { a: 0.5, n: 12 }), tick(r, 1.15)],
  );
  const size = shape === "box" ? 16 : 18;
  return (
    <Svg w={size} h={size} {...props}>
      <path d={outline} />
      <path d={t} className="tick" pathLength={1} />
    </Svg>
  );
}

/** A wavy horizontal line stretched to its box (strikethroughs, underlines). */
export function StretchLine({ seed, wave = 0.6, ...props }: SvgProps & { seed: string; wave?: number }) {
  const [d] = usePaths(`ln-${seed}`, (r) => [line(1, 3, 99, 3, r, { a: 0.7, n: 12, wave })]);
  return (
    <Svg w={100} h={6} stretch {...props}>
      <path d={d} style={{ vectorEffect: "non-scaling-stroke" }} />
    </Svg>
  );
}

/** Measures its parent and draws a marker frame around it. */
export function Frame({ seed, pad = 2, a = 1.1, ...props }: SvgProps & { seed: string; pad?: number; a?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const w = Math.round(parent.offsetWidth);
      const h = Math.round(parent.offsetHeight);
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);
  const d = useMemo(() => (size ? rect(size.w, size.h, rng(`fr-${seed}`), pad, a) : ""), [size, seed, pad, a]);
  return (
    <svg
      ref={ref}
      className={`sk ${props.className ?? ""}`}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", ...props.style }}
      viewBox={size ? `0 0 ${size.w} ${size.h}` : undefined}
      aria-hidden="true"
    >
      {d && <path d={d} />}
    </svg>
  );
}
