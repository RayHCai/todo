import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { monthRange, type MonthKey } from "../lib/dates";
import { useUi } from "../store/ui";
import { api } from "./http";

export const sessionKey = ["session"] as const;
export const boardKey = (today: string) => ["board", today] as const;
export const historyKey = (month: MonthKey) => ["history", month] as const;

export function useSession() {
  return useQuery({ queryKey: sessionKey, queryFn: api.session, staleTime: Infinity, retry: 1 });
}

export function useBoard(enabled: boolean) {
  const today = useUi((s) => s.today);
  return useQuery({
    queryKey: boardKey(today),
    queryFn: () => api.board(today),
    enabled,
    // On midnight rollover, keep showing yesterday's board until today's arrives, so the
    // columns can slide from one to the other instead of flashing a skeleton.
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/**
 * One `/api/history` query per month. The calendar passes the months it shows plus one on
 * either side, so the neighbouring month is already loaded when it scrolls into view.
 */
export function useHistoryMonths(months: MonthKey[]) {
  return useQueries({
    queries: months.map((month) => ({
      queryKey: historyKey(month),
      queryFn: () => {
        const { from, to } = monthRange(month);
        return api.history(from, to);
      },
      staleTime: 60_000,
    })),
  });
}
