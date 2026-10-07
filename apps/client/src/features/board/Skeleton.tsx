import styles from "./Skeleton.module.css";

/** Shaped like the real board, with a soft diagonal shimmer. */
export function Skeleton() {
  return (
    <div className={styles.page} aria-busy="true" aria-label="Loading your board">
      <div className={`${styles.bone} ${styles.title}`} />
      <div className={styles.cards}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${styles.bone} ${styles.card}`} />
        ))}
      </div>
      <div className={styles.columns}>
        {[5, 3, 4].map((rows, c) => (
          <div key={c} className={styles.col}>
            <div className={`${styles.bone} ${styles.head}`} />
            {Array.from({ length: rows }, (_, r) => (
              <div
                key={r}
                className={`${styles.bone} ${styles.row}`}
                style={{ width: `${88 - ((r * 13 + c * 7) % 30)}%` }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
