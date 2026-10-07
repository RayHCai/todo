import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useBoard } from "../../api/queries";
import { COLUMN_KEYS, type Board as BoardData, type ColumnKey } from "../../lib/board";
import { dayLabel, localToday, longDayLabel, monthKey, weekRangeLabel } from "../../lib/dates";
import { startEntrance } from "../../motion/entrance";
import { spring } from "../../motion/tokens";
import { originOf, useUi } from "../../store/ui";
import { TodoColumn } from "../columns/TodoColumn";
import { GoalsCarousel } from "../goals/GoalsCarousel";
import { Header } from "./Header";
import { Skeleton } from "./Skeleton";
import styles from "./Board.module.css";

const TITLES: Record<ColumnKey, string> = { today: "Today", tomorrow: "Tomorrow", week: "This Week" };

export function Board() {
  const { data, isPending, isError, error, refetch } = useBoard(true);
  useEffect(() => startEntrance(), []);
  useShortcuts(data);

  if (isPending) return <Skeleton />;
  if (isError || !data) {
    return (
      <div className={styles.failed}>
        <p>Couldn't load your board. {error instanceof Error ? error.message : ""}</p>
        <button onClick={() => void refetch()}>Try again</button>
      </div>
    );
  }

  return (
    <main className={styles.page}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.18 }}>
        <Header month={data.dates.month} />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...spring.smooth, delay: 0.108 }}
      >
        <GoalsCarousel active={data.goals.active} completed={data.goals.completed} />
      </motion.div>
      <Columns data={data} />
    </main>
  );
}

function Columns({ data }: { data: BoardData }) {
  const reduced = useReducedMotion();
  const [tab, setTab] = useState<ColumnKey>("today");
  const stripRef = useRef<HTMLDivElement>(null);
  const { dates } = data;
  const subtitle: Record<ColumnKey, string> = {
    today: dayLabel(dates.today),
    tomorrow: dayLabel(dates.tomorrow),
    week: weekRangeLabel(dates.weekStart),
  };
  const spoken: Record<ColumnKey, string> = {
    today: longDayLabel(dates.today),
    tomorrow: longDayLabel(dates.tomorrow),
    week: `week of ${weekRangeLabel(dates.weekStart)}`,
  };
  const windowKey: Record<ColumnKey, string> = { today: dates.today, tomorrow: dates.tomorrow, week: dates.weekStart };

  // On phones the columns are a swipeable strip; the tab follows the scroll position.
  function onStripScroll() {
    const el = stripRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    const next = COLUMN_KEYS[i];
    if (next && next !== tab) setTab(next);
  }
  function selectTab(key: ColumnKey) {
    setTab(key);
    const el = stripRef.current;
    el?.scrollTo({ left: COLUMN_KEYS.indexOf(key) * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  }

  return (
    <>
      <div className={styles.tabs} role="tablist" aria-label="Columns">
        {COLUMN_KEYS.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={styles.tab}
            onClick={() => selectTab(key)}
          >
            {tab === key && (
              <motion.span layoutId="tab-indicator" className={styles.indicator} transition={spring.snappy} />
            )}
            <span className={styles.tabLabel}>{key === "week" ? "Week" : TITLES[key]}</span>
          </button>
        ))}
      </div>
      <div ref={stripRef} className={styles.columns} onScroll={onStripScroll}>
        {COLUMN_KEYS.map((key, i) => (
          <motion.div
            key={key}
            className={styles.colWrap}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.smooth, delay: 0.18 + i * 0.072 }}
          >
            <TodoColumn
              column={key}
              index={i}
              title={TITLES[key]}
              subtitle={subtitle[key]}
              spokenDate={spoken[key]}
              active={data[key].active}
              completed={data[key].completed}
              windowKey={windowKey[key]}
            />
          </motion.div>
        ))}
      </div>
    </>
  );
}

/** N new todo · G new goal · C calendar. (T and ← → belong to the calendar while it's open.) */
function useShortcuts(data: BoardData | undefined) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const ui = useUi.getState();
      const t = e.target;
      if (e.metaKey || e.ctrlKey || e.altKey || ui.modal || ui.auth !== "open") return;
      if (
        t instanceof HTMLElement &&
        (t.matches("input:not([type=checkbox]), textarea, select") || t.isContentEditable)
      )
        return;
      const key = e.key.toLowerCase();
      if (key === "n") {
        e.preventDefault();
        ui.openCreate("today", originOf(document.querySelector('[data-column="today"] button')));
      } else if (key === "g") {
        e.preventDefault();
        ui.openCreate("goal", originOf(document.querySelector('section[aria-label="Goals"]')));
      } else if (key === "c") {
        e.preventDefault();
        if (ui.calendar) ui.closeCalendar();
        else {
          const icon = document.querySelector('[aria-label="Open calendar"]')?.getBoundingClientRect();
          ui.openCalendar(
            monthKey(data?.dates.today ?? localToday()),
            icon ? { x: icon.left + icon.width / 2, y: icon.top + icon.height / 2 } : undefined,
          );
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data]);
}
