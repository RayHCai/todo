import { useEffect, useState } from "react";
import { ellipse, rng, tick, wob } from "../../sketch/paths";
import { reducedMotion } from "../../motion/tokens";
import { onFx, type FxEvent } from "./fx";
import styles from "./FxLayer.module.css";

interface Live {
  id: number;
  event: FxEvent;
}

let nextId = 0;
const LIFETIME = { tick: 990, goal: 1350, ripple: 855 } as const;
/** The goal wash is drawn small and scaled up; it's a soft gradient, so upscaling costs nothing visible. */
const WASH = 160;

/**
 * Full-page moments behind the board: a large marker tick when a todo is done, a frame around
 * the whole viewport plus a color wash when a goal is achieved, and rings where something new lands.
 *
 * These cover most of the screen, so they only ever animate transform and opacity in CSS: each
 * layer rasterizes once and the compositor moves it. Redrawing strokes or scaling from JS would
 * repaint a viewport-sized layer every frame, which Retina displays at 120Hz can't keep up with.
 */
export function FxLayer() {
  const [live, setLive] = useState<Live[]>([]);

  useEffect(
    () =>
      onFx((event) => {
        // Checked per event: the preference can change while the app is open.
        if (reducedMotion()) return;
        const id = ++nextId;
        setLive((l) => [...l.slice(-5), { id, event }]);
        window.setTimeout(() => setLive((l) => l.filter((x) => x.id !== id)), LIFETIME[event.kind]);
      }),
    [],
  );

  return (
    <div className={styles.layer} aria-hidden="true">
      {live.map(({ id, event }) => (
        <Effect key={id} id={id} event={event} />
      ))}
    </div>
  );
}

function Effect({ id, event }: { id: number; event: FxEvent }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = rng(`fx-${id}`);
  const life = { animationDuration: `${LIFETIME[event.kind]}ms` };

  if (event.kind === "tick") {
    const s = Math.min(vw, vh) * 0.46;
    // A left-to-right wipe follows the tick's own stroke direction, so it still reads as drawn.
    return (
      <div className={styles.fx} style={{ ...life, width: s, height: s, left: (vw - s) / 2, top: (vh - s) / 2 }}>
        <div className={styles.wipe}>
          <svg
            className={`${styles.svg} ${styles.unwipe}`}
            viewBox="0 0 16 16"
            style={{ strokeWidth: (3.5 * 16) / s, strokeOpacity: 0.1 }}
          >
            <path d={tick(r)} />
          </svg>
        </div>
      </div>
    );
  }

  if (event.kind === "goal") {
    const m = 16;
    const frame = wob(
      [
        [m, m],
        [vw - m, m],
        [vw - m, vh - m],
        [m, vh - m],
        [m, m - 6],
      ],
      r,
      3,
    );
    const size = Math.hypot(vw, vh) * 1.1;
    return (
      <div className={`${styles.fx} ${styles.full}`} style={life}>
        <div
          className={styles.wash}
          style={{
            left: event.x - WASH / 2,
            top: event.y - WASH / 2,
            background: `radial-gradient(closest-side, ${event.color} 70%, transparent)`,
            transform: `scale(${size / WASH})`,
          }}
        />
        <svg
          className={`${styles.svg} ${styles.frame}`}
          viewBox={`0 0 ${vw} ${vh}`}
          style={{ color: event.color, strokeWidth: 3, strokeOpacity: 0.55 }}
        >
          <path d={frame} />
        </svg>
      </div>
    );
  }

  const s = Math.min(vw, vh) * 0.55;
  return (
    <div className={styles.fx} style={{ ...life, width: s, height: s, left: event.x - s / 2, top: event.y - s / 2 }}>
      <svg
        className={`${styles.svg} ${styles.ripple}`}
        viewBox="0 0 100 100"
        style={{ strokeWidth: 200 / s, strokeOpacity: 0.14 }}
      >
        <path d={ellipse(50, 50, 44, 44, r, { a: 1.2, n: 18 })} />
        <path d={ellipse(50, 50, 29, 29, r, { a: 1, n: 14 })} />
      </svg>
    </div>
  );
}
