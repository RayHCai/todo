import { lazy, Suspense, useEffect } from "react";
import { onUnauthorized } from "./api/http";
import { useSession } from "./api/queries";
import { LockScreen } from "./features/auth/LockScreen";
import { Board } from "./features/board/Board";
import { FxLayer } from "./features/fx/FxLayer";
import { ItemModal } from "./features/modal/ItemModal";
import { Toasts } from "./features/toasts/Toasts";
import { localToday, msUntilNextMidnight } from "./lib/dates";
import { useUi } from "./store/ui";

// The calendar is the biggest feature and only needed on demand.
const CalendarOverlay = lazy(() =>
  import("./features/calendar/CalendarOverlay").then((m) => ({ default: m.CalendarOverlay })),
);

export function App() {
  const session = useSession();
  const auth = useUi((s) => s.auth);
  const setAuth = useUi((s) => s.setAuth);
  const announcement = useUi((s) => s.announcement);

  // While the session check is pending, only the background shows (no content flash).
  useEffect(() => {
    if (auth !== "checking") return;
    if (session.data) setAuth(session.data.authenticated ? "open" : "locked");
    else if (session.isError) setAuth("locked");
  }, [auth, session.data, session.isError, setAuth]);

  // Any 401 from a later request relocks the app and drops the cache.
  useEffect(() => {
    onUnauthorized(() => {
      const { auth: phase, setAuth: set, closeModal, closeCalendar } = useUi.getState();
      if (phase !== "open") return;
      closeModal();
      closeCalendar();
      set("relocking");
    });
    return () => onUnauthorized(null);
  }, []);

  useMidnightRollover();
  useCalendarFromUrl(auth === "open");

  const boardVisible = auth === "open" || auth === "unlocking" || auth === "relocking";
  const lockVisible = auth === "locked" || auth === "unlocking" || auth === "relocking";

  return (
    <>
      <FxLayer />
      {boardVisible && <Board />}
      {auth === "open" && (
        <>
          <ItemModal />
          <Suspense fallback={null}>
            <CalendarOverlay />
          </Suspense>
        </>
      )}
      {lockVisible && <LockScreen />}
      <Toasts />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </>
  );
}

/** Re-checks the local date at the next midnight and whenever the tab comes back into view. */
function useMidnightRollover() {
  const setToday = useUi((s) => s.setToday);
  useEffect(() => {
    let timer: number;
    const check = () => {
      const now = localToday();
      if (now !== useUi.getState().today) setToday(now);
    };
    const schedule = () => {
      timer = window.setTimeout(() => {
        check();
        schedule();
      }, msUntilNextMidnight());
    };
    schedule();
    const onVisible = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [setToday]);
}

/** `?calendar=YYYY-MM` reopens the calendar where it was after a refresh. */
function useCalendarFromUrl(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const month = new URL(window.location.href).searchParams.get("calendar");
    if (month && /^\d{4}-\d{2}$/.test(month)) useUi.getState().openCalendar(month);
  }, [ready]);
}
