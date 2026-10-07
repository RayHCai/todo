/**
 * Optimistic mutations on the `['board', today]` cache. Each one patches the cache in
 * `onMutate`, rolls back in `onError` (the item shakes and a toast explains), and reconciles
 * by refetching once no other mutation is in flight.
 */
import type { Goal, GoalColor, Todo } from "@todo/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  draftGoal,
  draftTodo,
  isGoal,
  isTmp,
  listForTodo,
  listOfType,
  locate,
  todoTarget,
  withActive,
  withCompletion,
  withoutItem,
  withReplacedItem,
  type Board,
  type Item,
  type ItemType,
  type Location,
} from "../lib/board";
import { aliasId, keyOf, resolveId, trackCreate } from "../lib/keys";
import { useUi } from "../store/ui";
import { api, ApiError } from "./http";
import { boardKey } from "./queries";

const message = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong.");

function useCache() {
  const qc = useQueryClient();
  const today = useUi((s) => s.today);
  const key = boardKey(today);
  return {
    qc,
    today,
    key,
    get: () => qc.getQueryData<Board>(key),
    set: (fn: (b: Board) => Board) => qc.setQueryData<Board>(key, (b) => (b ? fn(b) : b)),
    /** Snapshot for rollback, after stopping any refetch that would overwrite the patch. */
    async begin() {
      await qc.cancelQueries({ queryKey: key });
      return qc.getQueryData<Board>(key);
    },
    rollback(prev: Board | undefined) {
      if (prev) qc.setQueryData(key, prev);
    },
    settle() {
      // Refetching while another optimistic patch is pending would briefly undo it.
      if (qc.isMutating() <= 1) {
        void qc.invalidateQueries({ queryKey: ["board"] });
        void qc.invalidateQueries({ queryKey: ["history"] });
      }
    },
  };
}

/* ---------------- complete / uncomplete ---------------- */

export function useToggleComplete() {
  const cache = useCache();
  const { shake, pushToast, announce } = useUi.getState();
  return useMutation({
    mutationFn: async ({ item, completed }: { item: Item; completed: boolean }) => {
      const id = await resolveId(item.id);
      const body = completed ? { completed: true, completedOn: cache.today } : { completed: false };
      return isGoal(item) ? api.updateGoal(id, body) : api.updateTodo(id, body);
    },
    onMutate: async ({ item, completed }) => {
      const prev = await cache.begin();
      cache.set((b) => withCompletion(b, item.id, completed, cache.today, new Date()));
      announce(`Marked ${item.title} ${completed ? "complete" : "not complete"}.`);
      return { prev };
    },
    onError: (err, { item, completed }, ctx) => {
      cache.rollback(ctx?.prev);
      shake(keyOf(item.id));
      pushToast({
        tone: "error",
        message: `Couldn't ${completed ? "complete" : "reopen"} “${item.title}”. ${message(err)}`,
      });
    },
    onSettled: () => cache.settle(),
  });
}

/* ---------------- create (and restore after delete) ---------------- */

export interface NewItem {
  type: ItemType;
  title: string;
  notes: string | null;
  color: GoalColor;
}

function createBody(item: Item, restore: boolean): Promise<Item> {
  const completion = restore && item.completedOn ? { completed: true, completedOn: item.completedOn } : {};
  const position = restore ? { position: item.position } : {};
  if (isGoal(item)) {
    return api.createGoal({
      title: item.title,
      description: item.description,
      color: item.color,
      month: item.month,
      ...position,
      ...completion,
    });
  }
  return api.createTodo({
    title: item.title,
    notes: item.notes,
    scope: item.scope,
    date: item.date,
    ...position,
    ...completion,
  });
}

function useCreateMutation() {
  const cache = useCache();
  const { shake, pushToast } = useUi.getState();
  return useMutation({
    mutationFn: ({ draft, restore }: { draft: Item; restore?: Location }) => {
      const created = createBody(draft, !!restore);
      trackCreate(
        draft.id,
        created.then((x) => x.id),
      );
      return created;
    },
    onMutate: async ({ draft, restore }): Promise<{ prev: Board | undefined }> => {
      const prev = await cache.begin();
      cache.set((b) => {
        if (restore) {
          const items = [...(b[restore.list][restore.section] as Item[])];
          items.splice(Math.min(restore.index, items.length), 0, draft);
          return { ...b, [restore.list]: { ...b[restore.list], [restore.section]: items } } as Board;
        }
        return withActive(
          b,
          isGoal(draft) ? "goals" : (listForTodo(b.dates, draft.scope, draft.date) ?? "today"),
          draft,
        );
      });
      return { prev };
    },
    onSuccess: (server, { draft }) => {
      aliasId(server.id, draft.id);
      cache.set((b) => {
        const current = locate(b, draft.id)?.item;
        // Keep anything the user changed while the request was in flight (e.g. ticked it off).
        const merged = current
          ? { ...server, completedAt: current.completedAt, completedOn: current.completedOn }
          : server;
        return withReplacedItem(b, draft.id, merged as Item);
      });
    },
    onError: (err, { draft }, ctx) => {
      cache.rollback(ctx?.prev);
      shake(keyOf(draft.id));
      pushToast({ tone: "error", message: `Couldn't save “${draft.title}”. ${message(err)}` });
    },
    onSettled: () => cache.settle(),
  });
}

export function useCreateItem() {
  const cache = useCache();
  const mutation = useCreateMutation();
  const { markLanded, announce } = useUi.getState();
  return (input: NewItem): string | null => {
    const board = cache.get();
    if (!board) return null;
    const now = new Date();
    const draft: Item =
      input.type === "goal"
        ? draftGoal(board, { title: input.title, description: input.notes, color: input.color }, now)
        : draftTodo(board, input.type, { title: input.title, notes: input.notes }, now);
    markLanded(draft.id);
    announce(`Added ${input.title}.`);
    mutation.mutate({ draft });
    return draft.id;
  };
}

/* ---------------- delete with undo ---------------- */

export function useDeleteItem() {
  const cache = useCache();
  const restore = useCreateMutation();
  const { pushToast, markLanded, announce } = useUi.getState();
  const mutation = useMutation({
    mutationFn: async (item: Item) => {
      const id = await resolveId(item.id);
      return isGoal(item) ? api.deleteGoal(id) : api.deleteTodo(id);
    },
    onMutate: async (item) => {
      const prev = await cache.begin();
      const at = prev ? locate(prev, item.id) : null;
      cache.set((b) => withoutItem(b, item.id));
      return { prev, at };
    },
    onSuccess: (_void, item, ctx) => {
      announce(`Deleted ${item.title}.`);
      pushToast({
        tone: "info",
        message: `Deleted “${item.title}”`,
        action: {
          label: "Undo",
          run: () => {
            const draft = { ...item, id: `tmp_restore_${Date.now().toString(36)}` } as Item;
            aliasId(draft.id, item.id);
            markLanded(keyOf(item.id));
            restore.mutate({ draft, restore: ctx.at ?? undefined });
          },
        },
      });
    },
    onError: (err, item, ctx) => {
      cache.rollback(ctx?.prev);
      pushToast({ tone: "error", message: `Couldn't delete “${item.title}”. ${message(err)}` });
    },
    onSettled: () => cache.settle(),
  });
  return mutation;
}

/* ---------------- edit, including moving between columns ---------------- */

export interface EditInput {
  item: Item;
  to: ItemType;
  title: string;
  notes: string | null;
  color: GoalColor;
}

export function useEditItem() {
  const cache = useCache();
  const { shake, pushToast } = useUi.getState();
  return useMutation({
    mutationFn: async ({ item, to, title, notes, color }: EditInput): Promise<Item> => {
      const id = await resolveId(item.id);
      const board = cache.get();
      if (isGoal(item) && to === "goal") return api.updateGoal(id, { title, description: notes, color });
      if (!isGoal(item) && to !== "goal") {
        const target = board ? todoTarget(to, board.dates) : {};
        return api.updateTodo(id, { title, notes, ...target });
      }
      // Switching between a goal and a todo: create the new kind, then delete the old one.
      let created: Goal | Todo;
      if (to === "goal") {
        created = await api.createGoal({ title, description: notes, color, month: board?.dates.month ?? cache.today });
        await api.deleteTodo(id);
      } else {
        const target = board ? todoTarget(to, board.dates) : { scope: "DAY" as const, date: cache.today };
        created = await api.createTodo({ title, notes, ...target });
        await api.deleteGoal(id);
      }
      aliasId(created.id, item.id);
      return created;
    },
    onMutate: async ({ item, to, title, notes, color }) => {
      const prev = await cache.begin();
      if (!prev) return { prev };
      const at = locate(prev, item.id);
      const from = at ? (at.list === "goals" ? "goal" : at.list) : to;
      if (from === to || !at) {
        const patched = isGoal(item) ? { ...item, title, description: notes, color } : { ...item, title, notes };
        cache.set((b) => withReplacedItem(b, item.id, patched as Item));
      } else if (at.section === "active") {
        // Moved: it leaves this column and lands at the bottom of the other.
        const now = new Date();
        let moved: Item;
        if (to === "goal") moved = { ...draftGoal(prev, { title, description: notes, color }, now), id: item.id };
        else moved = { ...draftTodo(prev, to, { title, notes }, now), id: item.id, createdAt: item.createdAt };
        cache.set((b) => withActive(withoutItem(b, item.id), listOfType(to), moved));
        useUi.getState().markLanded(keyOf(item.id));
      }
      return { prev };
    },
    onSuccess: (server, { item }) => {
      if (server.id !== item.id && !isTmp(server.id)) cache.set((b) => withReplacedItem(b, item.id, server));
    },
    onError: (err, { item }, ctx) => {
      cache.rollback(ctx?.prev);
      shake(keyOf(item.id));
      pushToast({ tone: "error", message: `Couldn't save “${item.title}”. ${message(err)}` });
    },
    // A move changes which list the server puts the item in; always reconcile.
    onSettled: () => cache.settle(),
  });
}
