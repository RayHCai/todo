import { AnimatePresence, motion } from "motion/react";
import { spring } from "../../motion/tokens";
import { useUi } from "../../store/ui";
import styles from "./Toasts.module.css";

/** Toasts slide up from the bottom, stack with slight scale offsets, and swipe away. */
export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismissToast);
  const ordered = [...toasts].reverse();
  return (
    <div className={styles.region} role="region" aria-label="Notifications">
      <AnimatePresence>
        {ordered.map((t, depth) => (
          <motion.div
            key={t.id}
            layout
            className={`${styles.toast} ${t.tone === "error" ? styles.error : ""}`}
            role={t.tone === "error" ? "alert" : "status"}
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: -depth * 8, opacity: depth > 2 ? 0 : 1, scale: 1 - depth * 0.04, zIndex: 10 - depth }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.144 } }}
            transition={spring.smooth}
            drag="x"
            dragSnapToOrigin
            onDragEnd={(_, info) => {
              if (Math.abs(info.offset.x) > 90 || Math.abs(info.velocity.x) > 500) dismiss(t.id);
            }}
            style={{ position: depth === 0 ? "relative" : "absolute" }}
          >
            <span className={styles.message}>{t.message}</span>
            {t.action && (
              <button
                className={styles.action}
                onClick={() => {
                  t.action?.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button className={styles.close} aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              ×
            </button>
            {t.action && <span className={styles.bar} style={{ animationDuration: `${t.duration}ms` }} />}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
