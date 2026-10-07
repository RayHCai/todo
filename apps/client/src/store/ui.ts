import { create } from "zustand";
import type { ItemType } from "../lib/board";
import { localToday, type MonthKey } from "../lib/dates";

export interface Origin {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const originOf = (el: Element | null | undefined): Origin | undefined => {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

export type ModalState =
  | { mode: "create"; type: ItemType; origin?: Origin }
  | { mode: "edit"; type: ItemType; itemId: string; origin?: Origin };

export interface Toast {
  id: number;
  message: string;
  tone: "info" | "error";
  action?: { label: string; run: () => void };
  /** Undo toasts show a shrinking bar for this long. */
  duration: number;
}

/** checking → (unlocking) → open → (relocking) → locked */
export type AuthPhase = "checking" | "locked" | "unlocking" | "open" | "relocking";

interface UiState {
  today: string;
  setToday: (today: string) => void;

  auth: AuthPhase;
  setAuth: (phase: AuthPhase) => void;

  modal: ModalState | null;
  openCreate: (type: ItemType, origin?: Origin) => void;
  openEdit: (type: ItemType, itemId: string, origin?: Origin) => void;
  closeModal: () => void;

  calendar: { month: MonthKey; origin?: { x: number; y: number } } | null;
  openCalendar: (month: MonthKey, origin?: { x: number; y: number }) => void;
  closeCalendar: () => void;

  toasts: Toast[];
  pushToast: (toast: Omit<Toast, "id" | "duration"> & { duration?: number }) => number;
  dismissToast: (id: number) => void;

  /** Keys of items that just landed (created or restored); they glow briefly. */
  landed: Record<string, number>;
  markLanded: (key: string) => void;
  /** Keys of items whose request failed; they shake once. */
  shaken: Record<string, number>;
  shake: (key: string) => void;

  announcement: string;
  announce: (message: string) => void;
}

let toastId = 0;

export const useUi = create<UiState>((set, get) => ({
  today: localToday(),
  setToday: (today) => set({ today }),

  auth: "checking",
  setAuth: (auth) => set({ auth }),

  modal: null,
  openCreate: (type, origin) => set({ modal: { mode: "create", type, origin } }),
  openEdit: (type, itemId, origin) => set({ modal: { mode: "edit", type, itemId, origin } }),
  closeModal: () => set({ modal: null }),

  calendar: null,
  openCalendar: (month, origin) => set({ calendar: { month, origin } }),
  closeCalendar: () => set({ calendar: null }),

  toasts: [],
  pushToast: (toast) => {
    const id = ++toastId;
    const duration = toast.duration ?? (toast.action ? 5000 : 4000);
    set({ toasts: [...get().toasts, { ...toast, id, duration }].slice(-4) });
    window.setTimeout(() => get().dismissToast(id), duration);
    return id;
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),

  landed: {},
  markLanded: (key) => {
    set({ landed: { ...get().landed, [key]: Date.now() } });
    window.setTimeout(() => {
      const { [key]: _, ...rest } = get().landed;
      set({ landed: rest });
    }, 1080);
  },
  shaken: {},
  shake: (key) => set({ shaken: { ...get().shaken, [key]: Date.now() } }),

  announcement: "",
  announce: (message) => {
    // Clear first so repeating the same sentence is still announced.
    set({ announcement: "" });
    window.setTimeout(() => set({ announcement: message }), 30);
  },
}));
