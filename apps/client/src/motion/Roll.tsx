import { AnimatePresence, motion } from "motion/react";
import styles from "./Roll.module.css";

/**
 * Odometer text: when `value` changes, the old text slides up and out while the new text
 * slides up into place, letter by letter. Digits are tabular so nothing jitters.
 */
export function Roll({
  value,
  className = "",
  stagger = 0.0225,
}: {
  value: string | number;
  className?: string;
  stagger?: number;
}) {
  const text = String(value);
  return (
    <span className={`${styles.roll} tabular ${className}`} aria-label={text} role="text">
      <span className={styles.sizer} aria-hidden="true">
        {text}
      </span>
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span key={text} className={styles.layer} aria-hidden="true">
          {[...text].map((ch, i) => (
            <motion.span
              key={i}
              className={styles.ch}
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ type: "spring", stiffness: 519, damping: 35.6, delay: i * stagger }}
            >
              {ch === " " ? " " : ch}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
