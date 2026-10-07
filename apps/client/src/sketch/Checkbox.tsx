import { motion } from "motion/react";
import { forwardRef, useMemo, useState, type ChangeEvent } from "react";
import { rng } from "./paths";
import { CheckMark } from "./Sketch";
import styles from "./Checkbox.module.css";

interface Props {
  checked: boolean;
  onChange: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
  label: string;
  seed: string;
  shape?: "box" | "ring";
  color?: string;
  className?: string;
  /** A few marker flecks burst out when it gets checked. */
  burst?: boolean;
}

/** A real checkbox, drawn in marker: the outline wobbles and the tick draws itself in. */
export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { checked, onChange, label, seed, shape = "box", color, className = "", burst = true },
  ref,
) {
  const [pops, setPops] = useState(0);
  return (
    <label
      className={`${styles.cb} ${shape === "ring" ? styles.ring : ""} ${className}`}
      style={color ? { color } : undefined}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        aria-label={label}
        onChange={(e) => {
          if (e.target.checked && burst) setPops((n) => n + 1);
          onChange(e.target.checked, e);
        }}
      />
      <CheckMark seed={seed} shape={shape} className={styles.mark} />
      {pops > 0 && <Flecks key={pops} seed={`${seed}-${pops}`} />}
    </label>
  );
});

/** Six or seven short strokes flying out from the box. */
function Flecks({ seed }: { seed: string }) {
  const flecks = useMemo(() => {
    const r = rng(seed);
    const n = 6 + Math.round(r());
    return Array.from({ length: n }, (_, i) => {
      const angle = (i / n) * Math.PI * 2 + r() * 0.6;
      const dist = 14 + r() * 10;
      return { angle, dist, len: 3 + r() * 3 };
    });
  }, [seed]);
  return (
    <span className={styles.flecks} aria-hidden="true">
      {flecks.map((f, i) => (
        <motion.span
          key={i}
          className={styles.fleck}
          style={{ rotate: `${(f.angle * 180) / Math.PI}deg`, width: f.len }}
          initial={{ x: 0, y: 0, opacity: 0.9 }}
          animate={{ x: Math.cos(f.angle) * f.dist, y: Math.sin(f.angle) * f.dist, opacity: 0 }}
          transition={{ duration: 0.405, ease: [0.22, 1, 0.36, 1], delay: 0.108 }}
        />
      ))}
    </span>
  );
}
