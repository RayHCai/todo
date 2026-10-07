import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/http";
import { sessionKey } from "../../api/queries";
import { spring } from "../../motion/tokens";
import { arc, ellipse, line, rng, tick, wob } from "../../sketch/paths";
import { useUi } from "../../store/ui";
import styles from "./LockScreen.module.css";

type Status = "idle" | "checking" | "wrong" | "success";

/**
 * The lock screen is two curtains (top and bottom halves) with the password field across the
 * seam. Unlocking splits the curtains; relocking closes them over the board.
 */
export function LockScreen() {
  const phase = useUi((s) => s.auth);
  const setAuth = useUi((s) => s.setAuth);
  const qc = useQueryClient();
  const reduced = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);

  // The faint spotlight follows the cursor: at most one transform write per frame, no repaint.
  useEffect(() => {
    if (reduced) return;
    const spots = rootRef.current?.querySelectorAll<HTMLElement>(`.${styles.spot}`) ?? [];
    let frame = 0;
    let x = 0;
    let y = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX - 420;
      y = e.clientY - 420;
      frame ||= requestAnimationFrame(() => {
        frame = 0;
        spots.forEach((s) => (s.style.transform = `translate3d(${x}px, ${y}px, 0)`));
      });
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  // Relock: the curtains have just closed over the board. Drop all cached data, then settle.
  useEffect(() => {
    if (phase !== "relocking") return;
    const t = window.setTimeout(
      () => {
        qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "session" });
        qc.setQueryData(sessionKey, { authenticated: false });
        setAuth("locked");
      },
      reduced ? 0 : 810,
    );
    return () => window.clearTimeout(t);
  }, [phase, qc, setAuth, reduced]);

  const opening = phase === "unlocking";
  const closing = phase === "relocking";
  const curtain = { duration: reduced ? 0 : 0.54, ease: [0.65, 0, 0.35, 1] as const };

  return (
    <div ref={rootRef} className={`${styles.root} ${opening ? styles.passThrough : ""}`}>
      <motion.div
        className={`${styles.curtain} ${styles.top}`}
        initial={closing ? { y: "-100%" } : false}
        animate={{ y: opening ? "-100%" : "0%" }}
        transition={{ ...curtain, delay: opening && !reduced ? 0.135 : 0 }}
        onAnimationComplete={() => opening && setAuth("open")}
      >
        <Scene />
      </motion.div>
      <motion.div
        className={`${styles.curtain} ${styles.bottom}`}
        initial={closing ? { y: "100%" } : false}
        animate={{ y: opening ? "100%" : "0%" }}
        transition={{ ...curtain, delay: opening && !reduced ? 0.135 : 0 }}
      >
        <Scene />
      </motion.div>
      <AnimatePresence>
        {phase === "locked" && <LockForm key="form" />}
        {closing && <Padlock key="padlock" />}
      </AnimatePresence>
    </div>
  );
}

/** The drifting color wash and cursor spotlight behind a curtain, sized to the whole viewport. */
function Scene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <span className={styles.spot} />
    </div>
  );
}

function LockForm() {
  const setAuth = useUi((s) => s.setAuth);
  const qc = useQueryClient();
  const reduced = useReducedMotion();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fallen, setFallen] = useState<number[]>([]);
  const [fieldRef, animateField] = useAnimate<HTMLDivElement>();
  const inputRef = useRef<HTMLInputElement>(null);
  const [ul] = useState(() => line(2, 4, 278, 4, rng("lock-ul"), { a: 0.9, n: 14, wave: 0.6 }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!value || status === "checking" || status === "success") return;
    setStatus("checking");
    setError(null);
    try {
      await api.login(value);
      setStatus("success");
      window.setTimeout(
        () => {
          qc.setQueryData(sessionKey, { authenticated: true });
          setAuth("unlocking");
        },
        reduced ? 0 : 468,
      );
    } catch (err) {
      setStatus("wrong");
      setError(
        err instanceof ApiError && err.status === 429
          ? "Too many attempts, try again in a minute."
          : err instanceof ApiError && err.status === 401
            ? "That's not it."
            : err instanceof ApiError
              ? err.message
              : "Couldn't reach the server.",
      );
      setFallen(Array.from({ length: value.length }, (_, i) => i));
      setValue("");
      if (!reduced) {
        void animateField(fieldRef.current, { x: [0, -12, 10, -7, 5, -2, 0] }, { duration: 0.378 });
      }
      inputRef.current?.focus();
      window.setTimeout(() => setFallen([]), 810);
    }
  }

  return (
    <motion.form
      className={styles.form}
      onSubmit={submit}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.162 } }}
      transition={spring.smooth}
    >
      <LockGlyph open={status === "success"} />
      <div ref={fieldRef} className={`${styles.field} ${status === "wrong" ? styles.wrong : ""}`}>
        <input
          ref={inputRef}
          className={styles.input}
          type="password"
          value={value}
          autoFocus
          autoComplete="current-password"
          aria-label="Password"
          aria-invalid={status === "wrong"}
          aria-describedby={error ? "lock-error" : undefined}
          onChange={(e) => {
            setValue(e.target.value);
            if (status === "wrong") setStatus("idle");
          }}
          disabled={status === "success"}
        />
        <div className={styles.dots} aria-hidden="true">
          {status === "success" ? (
            <Converge count={Math.max(value.length, 3)} />
          ) : (
            <>
              <AnimatePresence initial={false}>
                {[...value].map((_, i) => (
                  <motion.span
                    key={i}
                    className={styles.dot}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0, transition: { duration: 0.108 } }}
                    transition={spring.bouncy}
                  />
                ))}
              </AnimatePresence>
              <span className={styles.caret} />
              {fallen.map((i) => (
                <FallingDot key={`f${i}`} index={i} total={fallen.length} />
              ))}
            </>
          )}
        </div>
        <svg className={`sk ${styles.underline}`} viewBox="0 0 280 8" preserveAspectRatio="none" aria-hidden="true">
          <path d={ul} style={{ vectorEffect: "non-scaling-stroke" }} />
        </svg>
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            id="lock-error"
            className={styles.error}
            role="alert"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
      <button className={styles.unlock} type="submit" disabled={!value || status === "checking"}>
        Unlock
      </button>
    </motion.form>
  );
}

/** A wrong password: each dot scatters and falls with gravity. */
function FallingDot({ index, total }: { index: number; total: number }) {
  const [r] = useState(() => rng(`fall-${index}-${Date.now()}`));
  const x0 = (index - (total - 1) / 2) * 18;
  return (
    <motion.span
      className={`${styles.dot} ${styles.falling}`}
      initial={{ x: x0, y: 0, opacity: 1, rotate: 0 }}
      animate={{
        x: x0 + (r() * 2 - 1) * 40,
        y: [0, -18 - r() * 16, 140],
        opacity: [1, 1, 0],
        rotate: (r() * 2 - 1) * 180,
      }}
      transition={{ duration: 0.72, ease: ["easeOut", "easeIn"], times: [0, 0.25, 1] }}
    />
  );
}

/** A correct password: the dots gather in the middle and become a tick. */
function Converge({ count }: { count: number }) {
  const t = useMemo(() => tick(rng("unlock"), 1), []);
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <motion.span
          key={i}
          className={`${styles.dot} ${styles.falling}`}
          initial={{ x: (i - (count - 1) / 2) * 18, scale: 1, opacity: 1 }}
          animate={{ x: 0, scale: 0.4, opacity: 0 }}
          transition={{ duration: 0.252, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
      <svg className={`sk ${styles.check}`} viewBox="0 0 16 16" aria-hidden="true">
        <motion.path
          d={t}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ delay: 0.18, duration: 0.27 }}
        />
      </svg>
    </>
  );
}

function LockGlyph({ open }: { open: boolean }) {
  const [body, shackle, ring] = useMemo(() => {
    const r = rng("lockscreen");
    return [
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
      ellipse(12, 15.5, 1.2, 1.2, r, { a: 0.1, n: 6 }),
    ];
  }, []);
  return (
    <svg className={`sk ${styles.glyph}`} viewBox="0 0 24 24" aria-hidden="true">
      <path d={body} />
      <motion.path
        d={shackle}
        animate={open ? { y: -3, rotate: -16 } : { y: 0, rotate: 0 }}
        style={{ transformBox: "fill-box", originX: 0, originY: 1 }}
        transition={spring.snappy}
      />
      <path d={ring} />
    </svg>
  );
}

/** Relock: a padlock draws itself in the middle of the closing curtains. */
function Padlock() {
  const [body, shackle] = useMemo(() => {
    const r = rng("padlock");
    return [
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
      wob(arc(12, 10.5, 4, Math.PI, Math.PI * 2, 10), r, 0.35),
    ];
  }, []);
  return (
    <motion.svg className={`sk ${styles.padlock}`} viewBox="0 0 24 24" aria-hidden="true" exit={{ opacity: 0 }}>
      <motion.path
        d={body}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay: 0.315, duration: 0.36 }}
      />
      <motion.path
        d={shackle}
        initial={{ pathLength: 0, y: -3 }}
        animate={{ pathLength: 1, y: [-3, -3, 0] }}
        transition={{ delay: 0.495, duration: 0.405, times: [0, 0.7, 1] }}
      />
    </motion.svg>
  );
}
