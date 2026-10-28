import {
  BoardResponse,
  ErrorBody,
  GoalSchema,
  HistoryResponse,
  ListSchema,
  ListsResponse,
  ListTaskSchema,
  SessionResponse,
  TodoSchema,
  type CreateGoalBody,
  type CreateListBody,
  type CreateListTaskBody,
  type CreateTodoBody,
  type Goal,
  type List,
  type ListTask,
  type Todo,
  type UpdateGoalBody,
  type UpdateListBody,
  type UpdateListTaskBody,
  type UpdateTodoBody,
} from "@todo/shared";
import type { z } from "zod";

/** A failed API call, carrying the server's `{ error: { code, message } }` envelope. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** Called whenever an authenticated request comes back 401, so the app can relock. */
export function onUnauthorized(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface RequestOptions<S extends z.ZodType | undefined> {
  body?: unknown;
  query?: Record<string, string>;
  schema?: S;
  /** Login and session checks answer 401 as part of their normal flow. */
  public?: boolean;
}

async function request<S extends z.ZodType | undefined = undefined>(
  method: Method,
  path: string,
  options: RequestOptions<S> = {},
): Promise<S extends z.ZodType ? z.infer<S> : void> {
  const qs = options.query ? `?${new URLSearchParams(options.query)}` : "";
  let res: Response;
  try {
    res = await fetch(`/api${path}${qs}`, {
      method,
      credentials: "same-origin",
      headers: options.body === undefined ? undefined : { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, "OFFLINE", "Can't reach the server. Check your connection.");
  }

  if (!res.ok) {
    let code = "HTTP_ERROR";
    let message = `Request failed (${res.status})`;
    try {
      const parsed = ErrorBody.parse(await res.json());
      code = parsed.error.code;
      message = parsed.error.message;
    } catch {
      // Not our envelope (proxy error page, etc.); keep the generic message.
    }
    if (res.status === 401 && !options.public) unauthorizedHandler?.();
    throw new ApiError(res.status, code, message);
  }

  if (!options.schema || res.status === 204) return undefined as never;
  return options.schema.parse(await res.json()) as never;
}

export const api = {
  session: () => request("GET", "/auth/session", { schema: SessionResponse, public: true }),
  login: (password: string) => request("POST", "/auth/login", { body: { password }, public: true }),
  logout: () => request("POST", "/auth/logout", { public: true }),

  board: (today: string) => request("GET", "/board", { query: { today }, schema: BoardResponse }),
  history: (from: string, to: string) => request("GET", "/history", { query: { from, to }, schema: HistoryResponse }),

  createTodo: (body: CreateTodoBody): Promise<Todo> => request("POST", "/todos", { body, schema: TodoSchema }),
  updateTodo: (id: string, body: UpdateTodoBody): Promise<Todo> =>
    request("PATCH", `/todos/${encodeURIComponent(id)}`, { body, schema: TodoSchema }),
  deleteTodo: (id: string) => request("DELETE", `/todos/${encodeURIComponent(id)}`),

  createGoal: (body: CreateGoalBody): Promise<Goal> => request("POST", "/goals", { body, schema: GoalSchema }),
  updateGoal: (id: string, body: UpdateGoalBody): Promise<Goal> =>
    request("PATCH", `/goals/${encodeURIComponent(id)}`, { body, schema: GoalSchema }),
  deleteGoal: (id: string) => request("DELETE", `/goals/${encodeURIComponent(id)}`),

  lists: () => request("GET", "/lists", { schema: ListsResponse }),
  createList: (body: CreateListBody): Promise<List> => request("POST", "/lists", { body, schema: ListSchema }),
  updateList: (id: string, body: UpdateListBody): Promise<List> =>
    request("PATCH", `/lists/${encodeURIComponent(id)}`, { body, schema: ListSchema }),
  deleteList: (id: string) => request("DELETE", `/lists/${encodeURIComponent(id)}`),

  createListTask: (body: CreateListTaskBody): Promise<ListTask> =>
    request("POST", "/list-tasks", { body, schema: ListTaskSchema }),
  updateListTask: (id: string, body: UpdateListTaskBody): Promise<ListTask> =>
    request("PATCH", `/list-tasks/${encodeURIComponent(id)}`, { body, schema: ListTaskSchema }),
  deleteListTask: (id: string) => request("DELETE", `/list-tasks/${encodeURIComponent(id)}`),
};
