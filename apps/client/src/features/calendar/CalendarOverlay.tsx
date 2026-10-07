import type { Goal, Todo } from "@todo/shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useHistoryMonths } from "../../api/queries";
import {
  daysOfWeek,
  fromIso,
  longDayLabel,
  monthKey,
  monthTitle,
  shiftMonth,
  weekRangeLabel,
  weeksCovering,
  type IsoDate,
  type MonthKey,
} from "../../lib/dates";
import { Roll } from "../../motion/Roll";
import { spring } from "../../motion/tokens";
import { ChevronIcon, CloseIcon, Frame } from "../../sketch/Sketch";
import { useUi } from "../../store/ui";
import { indexHistory, type DayEntry, type HistoryIndex } from "./history";
import styles from "./CalendarOverlay.module.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** How far the calendar scrolls in either direction. */
const MONTHS_BACK = 36;
const MONTHS_AHEAD = 12;

export function CalendarOverlay() {
  const calendar = useUi((s) => s.calendar);
  const origin = calendar?.origin;
  const reveal = (r: string) => `circle(${r} at ${origin ? `${origin.x}px ${origin.y}px` : "calc(100% - 40px) 40px"})`;
  return (
    <AnimatePresence>
      {calendar && (
        <motion.div
          key="calendar"
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="History calendar"
          initial={{ clipPath: reveal("0px") }}
          animate={{ clipPath: reveal("150vmax") }}
          exit={{ clipPath: reveal("0px") }}
          transition={{ duration: 0.378, ease: [0.22, 1, 0.36, 1] }}
        >
          <Calendar initialMonth={calendar.month} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Calendar({ initialMonth }: { initialMonth: MonthKey }) {
  const today = useUi((s) => s.today);
  const close = useUi((s) => s.closeCalendar);
  const reduced = useReducedMotion();
  const thisMonth = monthKey(today);
  const [range, setRange] = useState(() => ({
    first: shiftMonth(initialMonth, -1),
    last: shiftMonth(initialMonth, 1),
  }));
  const [focused, setFocused] = useState<MonthKey>(initialMonth);
  const [detail, setDetail] = useState<IsoDate | null>(null);
  const [pulse, setPulse] = useState(0);
  const [openWeeks, setOpenWeeks] = useState<Set<IsoDate>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  const initialMonths = useRef(new Set([range.first, initialMonth, range.last]));

  const months = useMemo(() => {
    const list: MonthKey[] = [];
    for (let m = shiftMonth(range.first, -1); m <= shiftMonth(range.last, 1); m = shiftMonth(m, 1)) list.push(m);
    return list;
  }, [range]);
  const queries = useHistoryMonths(months);
  const pages = queries.map((q) => q.data);
  const loading = queries.some((q) => q.isPending);
  // Re-index only when a month's data actually changes.
  const stamp = queries.map((q) => q.dataUpdatedAt).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `stamp` tracks `pages`
  const index = useMemo(() => indexHistory(pages, today), [stamp, today]);

  const weeks = useMemo(() => weeksCovering(range.first, range.last), [range]);
  const minMonth = shiftMonth(thisMonth, -MONTHS_BACK);
  const maxMonth = shiftMonth(thisMonth, MONTHS_AHEAD);

  // Mirror the focused month to ?calendar=YYYY-MM so a refresh keeps your place.
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("calendar", focused);
    window.history.replaceState(null, "", url);
  }, [focused]);
  useEffect(
    () => () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("calendar");
      window.history.replaceState(null, "", url);
    },
    [],
  );

  const scrollToMonth = useCallback(
    (m: MonthKey, smooth = true) => {
      const target =
        m === thisMonth
          ? scrollRef.current?.querySelector(`[data-week-of-today]`)
          : scrollRef.current?.querySelector(`[data-banner="${m}"]`);
      target?.scrollIntoView({
        block: m === thisMonth ? "center" : "start",
        behavior: smooth && !reduced ? "smooth" : "auto",
      });
    },
    [thisMonth, reduced],
  );

  // Open at the current week (or the month from the URL).
  useLayoutEffect(() => {
    scrollToMonth(initialMonth, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on open
  }, []);

  // Prepending a month must not move what you're looking at.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && anchor.current) {
      el.scrollTop = anchor.current.top + (el.scrollHeight - anchor.current.height);
      anchor.current = null;
    }
  }, [range.first]);

  // Load the next month as either end comes into view.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const edge = (e.target as HTMLElement).dataset.edge;
          if (edge === "top") {
            setRange((r) => {
              if (r.first <= minMonth) return r;
              anchor.current = { height: root.scrollHeight, top: root.scrollTop };
              return { ...r, first: shiftMonth(r.first, -1) };
            });
          } else if (edge === "bottom") {
            setRange((r) => (r.last >= maxMonth ? r : { ...r, last: shiftMonth(r.last, 1) }));
          }
        }
      },
      { root, rootMargin: "400px 0px" },
    );
    root.querySelectorAll("[data-edge]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [minMonth, maxMonth]);

  // The sticky label follows the month whose banner most recently passed the middle of the view.
  // Measured at most once per frame.
  const scrollFrame = useRef(0);
  const onScroll = useCallback(() => {
    scrollFrame.current ||= requestAnimationFrame(() => {
      scrollFrame.current = 0;
      const root = scrollRef.current;
      if (!root) return;
      const r = root.getBoundingClientRect();
      const top = r.top + r.height / 2;
      let current: MonthKey | null = null;
      root.querySelectorAll<HTMLElement>("[data-banner]").forEach((b) => {
        if (b.getBoundingClientRect().top <= top) current = b.dataset.banner ?? current;
      });
      if (current) setFocused(current);
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(scrollFrame.current), []);

  const toggleWeek = useCallback(
    (w: IsoDate) =>
      setOpenWeeks((s) => {
        const next = new Set(s);
        if (next.has(w)) next.delete(w);
        else next.add(w);
        return next;
      }),
    [],
  );

  function go(by: number) {
    const target = shiftMonth(focused, by);
    if (target < minMonth || target > maxMonth) return;
    setRange((r) => ({
      first: target < r.first ? target : r.first,
      last: target > r.last ? target : r.last,
    }));
    requestAnimationFrame(() => scrollToMonth(target));
  }

  function jumpToday() {
    setRange((r) => ({
      first: thisMonth < r.first ? thisMonth : r.first,
      last: thisMonth > r.last ? thisMonth : r.last,
    }));
    requestAnimationFrame(() => {
      scrollToMonth(thisMonth);
      window.setTimeout(() => setPulse((p) => p + 1), reduced ? 0 : 405);
    });
  }

  // Keys: Esc closes the day detail, then the calendar. ← → step months. T jumps to today.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (useUi.getState().modal) return;
      const typing = e.target instanceof HTMLElement && e.target.matches("input, textarea");
      if (e.key === "Escape") {
        e.preventDefault();
        if (detail) setDetail(null);
        else close();
      } else if (typing || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        jumpToday();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className={styles.calendar}>
      <header className={styles.bar}>
        <h2 className={styles.month}>
          <Roll value={monthTitle(`${focused}-01`)} stagger={0.0135} />
        </h2>
        {loading && (
          <span className={styles.loading} aria-live="polite">
            Loading…
          </span>
        )}
        <div className={styles.nav}>
          <button className={styles.iconBtn} aria-label="Previous month" onClick={() => go(-1)}>
            <ChevronIcon dir="left" />
          </button>
          <button className={styles.todayBtn} onClick={jumpToday} aria-keyshortcuts="T">
            Today
          </button>
          <button className={styles.iconBtn} aria-label="Next month" onClick={() => go(1)}>
            <ChevronIcon dir="right" />
          </button>
          <button className={styles.iconBtn} aria-label="Close calendar" onClick={close}>
            <CloseIcon />
          </button>
        </div>
      </header>

      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
        <span className={styles.weekHead}>Week</span>
      </div>

      <motion.div
        ref={scrollRef}
        className={styles.scroll}
        onScroll={onScroll}
        animate={detail ? { scale: 0.98, opacity: 0.45 } : { scale: 1, opacity: 1 }}
        transition={spring.smooth}
        role="grid"
        aria-label="Days"
      >
        <div data-edge="top" className={styles.edge} />
        {weeks.map((w, rowIndex) => {
          const days = daysOfWeek(w);
          const firstOfMonth = days.find((d) => d.endsWith("-01"));
          const isFirstRow = rowIndex === 0;
          const bannerMonth = firstOfMonth ? monthKey(firstOfMonth) : isFirstRow ? monthKey(days[6]!) : null;
          const cascade = initialMonths.current.has(monthKey(w)) && rowIndex < 14;
          return (
            <div key={w}>
              {bannerMonth && bannerMonth >= range.first && (
                <MonthBanner month={bannerMonth} goals={index.months.get(bannerMonth) ?? []} />
              )}
              <WeekRow
                weekStart={w}
                index={index}
                today={today}
                focused={focused}
                pulse={pulse}
                cascadeRow={cascade && !reduced ? rowIndex : null}
                weekOpen={openWeeks.has(w)}
                onToggleWeek={toggleWeek}
                onOpenDay={setDetail}
              />
            </div>
          );
        })}
        <div data-edge="bottom" className={styles.edge} />
      </motion.div>

      <AnimatePresence>
        {detail && (
          <DayDetail
            key={detail}
            day={detail}
            entry={index.days.get(detail)}
            today={today}
            onClose={() => setDetail(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function MonthBanner({ month, goals }: { month: MonthKey; goals: Goal[] }) {
  return (
    <div className={styles.banner} data-banner={month}>
      <span className={styles.bannerTitle}>{monthTitle(`${month}-01`)}</span>
      <ul className={styles.pills}>
        {goals.map((g, i) => (
          <motion.li
            key={g.id}
            className={`${styles.pill} ${g.completedAt ? styles.pillDone : ""}`}
            style={{ color: `var(--goal-${g.color})` }}
            initial={{ scale: 0.6, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ ...spring.bouncy, delay: i * 0.045 }}
          >
            {g.completedAt && <span aria-label="achieved">✓ </span>}
            <span className={styles.pillText}>{g.title}</span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

interface RowProps {
  weekStart: IsoDate;
  index: HistoryIndex;
  today: IsoDate;
  focused: MonthKey;
  pulse: number;
  cascadeRow: number | null;
  weekOpen: boolean;
  onToggleWeek: (weekStart: IsoDate) => void;
  onOpenDay: (day: IsoDate) => void;
}

/**
 * Rows and cells are memoized: every cell carries a `layoutId`, and each re-render makes Motion
 * re-measure it. Without this, every focused-month change while scrolling re-measured them all.
 */
const WeekRow = memo(function WeekRow({
  weekStart,
  index,
  today,
  focused,
  pulse,
  cascadeRow,
  weekOpen,
  onToggleWeek,
  onOpenDay,
}: RowProps) {
  const days = useMemo(() => daysOfWeek(weekStart), [weekStart]);
  const week = index.weeks.get(weekStart);
  const weekItems = [...(week?.done ?? []), ...(week?.open ?? [])];
  const hasToday = days.includes(today);
  return (
    <div className={styles.row} role="row" data-week-of-today={hasToday || undefined}>
      {days.map((d, col) => (
        <DayCell
          key={d}
          day={d}
          entry={index.days.get(d)}
          today={today}
          dimmed={monthKey(d) !== focused}
          pulse={d === today ? pulse : 0}
          delay={cascadeRow === null ? null : (cascadeRow + col) * 13.5}
          onOpen={onOpenDay}
        />
      ))}
      <div className={styles.weekCell} role="gridcell" aria-label={`Week of ${weekRangeLabel(weekStart)}`}>
        <WeekItems items={weekItems} />
      </div>
      {weekItems.length > 0 && (
        <div className={styles.weekStrip}>
          <button className={styles.weekToggle} aria-expanded={weekOpen} onClick={() => onToggleWeek(weekStart)}>
            Week · {weekItems.length}
          </button>
          {weekOpen && <WeekItems items={weekItems} />}
        </div>
      )}
    </div>
  );
});

function WeekItems({ items }: { items: Todo[] }) {
  return (
    <ul className={styles.items}>
      {items.slice(0, 3).map((t) => (
        <li key={t.id} className={t.completedAt ? styles.itemDone : undefined}>
          {t.title}
        </li>
      ))}
      {items.length > 3 && <li className={styles.more}>+{items.length - 3} more</li>}
    </ul>
  );
}

const DayCell = memo(function DayCell({
  day,
  entry,
  today,
  dimmed,
  pulse,
  delay,
  onOpen,
}: {
  day: IsoDate;
  entry: DayEntry | undefined;
  today: IsoDate;
  dimmed: boolean;
  pulse: number;
  delay: number | null;
  onOpen: (day: IsoDate) => void;
}) {
  const items = entry ? [...entry.completed, ...entry.missed, ...entry.open] : [];
  const meter = entry && entry.scheduled > 0 ? entry.doneOnTime / entry.scheduled : null;
  const heat = Math.min(1, (entry?.completions ?? 0) / 5);
  const state = day === today ? styles.today : day > today ? styles.future : "";
  const label = `${longDayLabel(day)}: ${entry?.completed.length ?? 0} completed, ${items.length} items`;
  return (
    <motion.button
      layoutId={`day-${day}`}
      className={`${styles.cell} ${state} ${dimmed ? styles.dimmed : ""} ${delay !== null ? styles.cascade : ""}`}
      style={{ "--heat": heat, animationDelay: delay !== null ? `${delay}ms` : undefined } as CSSProperties}
      role="gridcell"
      aria-label={label}
      onClick={() => onOpen(day)}
      transition={spring.smooth}
    >
      <span className={`${styles.date} tabular`}>{fromIso(day).getDate()}</span>
      <ul className={styles.items}>
        {items.slice(0, 3).map((t) => (
          <li
            key={t.id}
            className={
              t.completedAt && entry?.completed.includes(t)
                ? styles.itemDone
                : entry?.missed.includes(t)
                  ? styles.itemMissed
                  : undefined
            }
          >
            {t.title}
          </li>
        ))}
        {items.length > 3 && <li className={styles.more}>+{items.length - 3} more</li>}
      </ul>
      {meter !== null && (
        <span className={styles.meter} aria-hidden="true">
          <span style={{ transform: `scaleX(${meter})` }} />
        </span>
      )}
      {pulse > 0 && <span key={pulse} className={styles.pulse} aria-hidden="true" />}
      {items.length > 0 && (
        <span className={styles.tip} aria-hidden="true">
          {entry?.completed.length ?? 0} done · {entry?.missed.length ?? 0} carried · {entry?.open.length ?? 0} open
        </span>
      )}
    </motion.button>
  );
});

function DayDetail({
  day,
  entry,
  today,
  onClose,
}: {
  day: IsoDate;
  entry: DayEntry | undefined;
  today: IsoDate;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  const groups: [string, Todo[]][] = [
    ["Completed", entry?.completed ?? []],
    [day < today ? "Carried over / missed" : "Carried over", entry?.missed ?? []],
    ["Open", entry?.open ?? []],
  ];
  const any = groups.some(([, items]) => items.length > 0);
  return (
    <div className={styles.detailRoot}>
      <motion.div
        className={styles.detailBackdrop}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        ref={ref}
        layoutId={`day-${day}`}
        className={styles.detail}
        role="dialog"
        aria-label={longDayLabel(day)}
        tabIndex={-1}
        transition={spring.smooth}
      >
        <Frame seed={`detail-${day}`} className={styles.detailFrame} a={1.3} />
        <div className={styles.detailHead}>
          <h3>{longDayLabel(day)}</h3>
          <button className={styles.iconBtn} aria-label="Close day" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        {!any && <p className={styles.nothing}>Nothing planned or done.</p>}
        {groups.map(
          ([title, items]) =>
            items.length > 0 && (
              <section key={title} className={styles.group}>
                <h4>
                  {title} <span className="tabular">{items.length}</span>
                </h4>
                <ul>
                  {items.map((t) => (
                    <li key={t.id} className={title === "Completed" ? styles.itemDone : undefined}>
                      <span>{t.title}</span>
                      {t.completedOn && t.completedOn !== t.date && (
                        <span className={styles.when}>
                          {title === "Completed" ? "planned" : "done"}{" "}
                          {fromIso(title === "Completed" ? t.date : t.completedOn).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ),
        )}
      </motion.div>
    </div>
  );
}
