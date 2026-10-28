/**
 * Optimistic mutations on the `['lists']` cache, following the board's pattern: patch in
 * `onMutate`, roll back in `onError` (with a shake and a toast), and refetch once no other
 * mutation is in flight.
 */
import type { GoalColor, List, ListTask, UpdateListTaskBody } from "@todo/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { aliasId, keyOf, resolveId, trackCreate } from "../lib/keys";
import {
  draftList,
  draftTask,
  patchList,
  patchTask,
  replaceList,
  withList,
  withoutList,
  withoutTask,
  withTask,
  type Lists,
} from "../lib/lists";
import { useUi } from "../store/ui";
import { api, ApiError } from "./http";
import { listsKey } from "./queries";

const message = (err: unknown) => (err instanceof ApiError ? err.message : "Something went wrong.");

function useCache() {
  const qc = useQueryClient();
  return {
    get: () => qc.getQueryData<Lists>(listsKey),
    set: (fn: (d: Lists) => Lists) => qc.setQueryData<Lists>(listsKey, (d) => (d ? fn(d) : d)),
    /** Snapshot for rollback, after stopping any refetch that would overwrite the patch. */
    async begin() {
      await qc.cancelQueries({ queryKey: listsKey });
      return qc.getQueryData<Lists>(listsKey);
    },
    rollback(prev: Lists | undefined) {
      if (prev) qc.setQueryData(listsKey, prev);
    },
    settle() {
      if (qc.isMutating() <= 1) void qc.invalidateQueries({ queryKey: listsKey });
    },
  };
}

/* ---------------- lists ---------------- */

/** Returns a function that adds a list and gives back its render key. */
export function useCreateList() {
  const cache = useCache();
  const { pushToast, announce } = useUi.getState();
  const mutation = useMutation({
    mutationFn: (draft: List) => {
      const created = api.createList({ name: draft.name, color: draft.color });
      trackCreate(
        draft.id,
        created.then((l) => l.id),
      );
      return created;
    },
    onMutate: async (draft) => {
      const prev = await cache.begin();
      cache.set((d) => withList(d, draft));
      return { prev };
    },
    onSuccess: (server, draft) => {
      aliasId(server.id, draft.id);
      cache.set((d) => replaceList(d, draft.id, server));
    },
    onError: (err, draft, ctx) => {
      cache.rollback(ctx?.prev);
      pushToast({ tone: "error", message: `Couldn't create “${draft.name}”. ${message(err)}` });
    },
    onSettled: () => cache.settle(),
  });
  return (name: string): string | null => {
    const data = cache.get();
    if (!data) return null;
    const draft = draftList(data, name, new Date());
    announce(`Added list ${name}.`);
    mutation.mutate(draft);
    return draft.id;
  };
}

export function useUpdateList() {
  const cache = useCache();
  const { pushToast } = useUi.getState();
  return useMutation({
    mutationFn: async ({ list, patch }: { list: List; patch: { name?: string; color?: GoalColor } }) =>
      api.updateList(await resolveId(list.id), patch),
    onMutate: async ({ list, patch }) => {
      const prev = await cache.begin();
      cache.set((d) => patchList(d, list.id, patch));
      return { prev };
    },
    onError: (err, { list }, ctx) => {
      cache.rollback(ctx?.prev);
      pushToast({ tone: "error", message: `Couldn't save “${list.name}”. ${message(err)}` });
    },
    onSettled: () => cache.settle(),
  });
}

export function useDeleteList() {
  const cache = useCache();
  const { pushToast, announce } = useUi.getState();
  return useMutation({
    mutationFn: async (list: List) => api.deleteList(await resolveId(list.id)),
    onMutate: async (list) => {
      const prev = await cache.begin();
      cache.set((d) => withoutList(d, list.id));
      return { prev };
    },
    onSuccess: (_void, list) => announce(`Deleted list ${list.name}.`),
    onError: (err, list, ctx) => {
      cache.rollback(ctx?.prev);
      pushToast({ tone: "error", message: `Couldn't delete “${list.name}”. ${message(err)}` });
    },
    onSettled: () => cache.settle(),
  });
}

/* ---------------- tasks ---------------- */

function useCreateTaskMutation() {
  const cache = useCache();
  const { shake, pushToast } = useUi.getState();
  return useMutation({
    mutationFn: ({ draft, restore }: { draft: ListTask; restore?: boolean }) => {
      const created = (async () =>
        api.createListTask({
          listId: await resolveId(draft.listId),
          title: draft.title,
          date: draft.date,
          ...(restore ? { position: draft.position } : {}),
          ...(restore && draft.completedOn ? { completed: true, completedOn: draft.completedOn } : {}),
        }))();
      trackCreate(
        draft.id,
        created.then((t) => t.id),
      );
      return created;
    },
    onMutate: async ({ draft }) => {
      const prev = await cache.begin();
      cache.set((d) => withTask(d, draft));
      return { prev };
    },
    onSuccess: (server, { draft }) => {
      aliasId(server.id, draft.id);
      cache.set((d) => {
        // Keep anything the user changed while the request was in flight.
        const current = d.tasks.find((t) => t.id === draft.id);
        const merged = current
          ? {
              ...server,
              title: current.title,
              date: current.date,
              completedAt: current.completedAt,
              completedOn: current.completedOn,
            }
          : server;
        return { ...d, tasks: d.tasks.map((t) => (t.id === draft.id ? merged : t)) };
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

/** Returns a function that adds an undated task to a list. */
export function useCreateTask() {
  const cache = useCache();
  const mutation = useCreateTaskMutation();
  const { markLanded, announce } = useUi.getState();
  return (listId: string, title: string): void => {
    const data = cache.get();
    if (!data) return;
    const draft = draftTask(data, listId, title, new Date());
    markLanded(draft.id);
    announce(`Added ${title}.`);
    mutation.mutate({ draft });
  };
}

export interface TaskPatch {
  title?: string;
  /** `null` clears the date. */
  date?: string | null;
  completed?: boolean;
}

export function useUpdateTask() {
  const cache = useCache();
  const today = useUi((s) => s.today);
  const { shake, pushToast } = useUi.getState();
  return useMutation({
    mutationFn: async ({ task, patch }: { task: ListTask; patch: TaskPatch }) => {
      const body: UpdateListTaskBody = {};
      if (patch.title !== undefined) body.title = patch.title;
      if (patch.date !== undefined) body.date = patch.date;
      if (patch.completed === true) Object.assign(body, { completed: true, completedOn: today });
      if (patch.completed === false) body.completed = false;
      return api.updateListTask(await resolveId(task.id), body);
    },
    onMutate: async ({ task, patch }) => {
      const prev = await cache.begin();
      const next: Partial<ListTask> = {};
      if (patch.title !== undefined) next.title = patch.title;
      if (patch.date !== undefined) next.date = patch.date;
      if (patch.completed === true) Object.assign(next, { completedAt: new Date().toISOString(), completedOn: today });
      if (patch.completed === false) Object.assign(next, { completedAt: null, completedOn: null });
      cache.set((d) => patchTask(d, task.id, next));
      return { prev };
    },
    onError: (err, { task }, ctx) => {
      cache.rollback(ctx?.prev);
      shake(keyOf(task.id));
      pushToast({ tone: "error", message: `Couldn't save “${task.title}”. ${message(err)}` });
    },
    onSettled: () => cache.settle(),
  });
}

export function useDeleteTask() {
  const cache = useCache();
  const restore = useCreateTaskMutation();
  const { pushToast, markLanded, announce } = useUi.getState();
  return useMutation({
    mutationFn: async (task: ListTask) => api.deleteListTask(await resolveId(task.id)),
    onMutate: async (task) => {
      const prev = await cache.begin();
      cache.set((d) => withoutTask(d, task.id));
      return { prev };
    },
    onSuccess: (_void, task) => {
      announce(`Deleted ${task.title}.`);
      pushToast({
        tone: "info",
        message: `Deleted “${task.title}”`,
        action: {
          label: "Undo",
          run: () => {
            const draft = { ...task, id: `tmp_restore_${Date.now().toString(36)}` };
            aliasId(draft.id, task.id);
            markLanded(keyOf(task.id));
            restore.mutate({ draft, restore: true });
          },
        },
      });
    },
    onError: (err, task, ctx) => {
      cache.rollback(ctx?.prev);
      pushToast({ tone: "error", message: `Couldn't delete “${task.title}”. ${message(err)}` });
    },
    onSettled: () => cache.settle(),
  });
}
