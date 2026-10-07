import { ErrorBody } from "@todo/shared";

export interface ApiClientOptions {
  /** Origin of the todo backend, e.g. `http://127.0.0.1:3000`. Routes are under `/api`. */
  baseUrl: string;
  /** The app's shared password (`APP_PASSWORD` on the server). */
  password: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
}

/** A failed backend call, carrying the server's `{ error: { code, message } }` envelope. */
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

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export interface ApiClient {
  request<T>(method: Method, path: string, body?: unknown): Promise<T>;
}

/**
 * A minimal client for the backend's JSON API. It logs in lazily with the shared password, keeps
 * the session cookie in memory, and logs in again once if a request comes back 401 (the session
 * expired or the server's password changed).
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const doFetch = options.fetch ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  let cookie: string | null = null;
  let loggingIn: Promise<string> | null = null;

  async function send(method: Method, path: string, body: unknown, sessionCookie?: string) {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (sessionCookie) headers.cookie = sessionCookie;
    try {
      return await doFetch(`${baseUrl}/api${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new ApiError(
        0,
        "UNREACHABLE",
        `Could not reach the todo backend at ${baseUrl} (${reason}). Is it running?`,
      );
    }
  }

  async function toApiError(res: Response): Promise<ApiError> {
    const text = await res.text();
    try {
      const parsed = ErrorBody.parse(JSON.parse(text));
      return new ApiError(res.status, parsed.error.code, parsed.error.message);
    } catch {
      return new ApiError(res.status, "HTTP_ERROR", `Backend returned ${res.status}: ${text.slice(0, 200)}`);
    }
  }

  async function login(): Promise<string> {
    const res = await send("POST", "/auth/login", { password: options.password });
    if (!res.ok) {
      const err = await toApiError(res);
      if (err.status === 401) {
        throw new ApiError(
          401,
          err.code,
          "Login to the todo backend failed: TODO_PASSWORD does not match the server's APP_PASSWORD.",
        );
      }
      throw err;
    }
    // Only the `sid=…` pair is sent back; attributes like Path and HttpOnly are for browsers.
    const setCookie = res.headers.getSetCookie().find((c) => c.startsWith("sid="));
    if (!setCookie) throw new ApiError(500, "INTERNAL", "Login succeeded but no session cookie was returned");
    return setCookie.split(";")[0]!;
  }

  async function session(): Promise<string> {
    if (cookie) return cookie;
    // Concurrent tool calls share one login so they don't trip the login rate limit.
    loggingIn ??= login().finally(() => (loggingIn = null));
    cookie = await loggingIn;
    return cookie;
  }

  return {
    async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
      let res = await send(method, path, body, await session());
      if (res.status === 401) {
        cookie = null;
        res = await send(method, path, body, await session());
      }
      if (!res.ok) throw await toApiError(res);
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    },
  };
}
