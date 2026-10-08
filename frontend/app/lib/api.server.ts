import type {
  ApiErrorBody,
  IdeaCard,
  IdeaCreate,
  IdeaView,
  Notification,
  Participant,
  Provider,
  PublicProfile,
  QueueItem,
  Thread,
  User,
} from "./api-types";
import type { ProfileUpdate } from "./profile";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: ApiErrorBody,
    public readonly retryAfter?: string,
  ) {
    super(body.error || `API request failed (${status})`);
    this.name = "ApiError";
  }
}

/** Preserve backend status/body when a loader fails so React Router renders the right boundary status. */
export async function routeApi<T>(task: Promise<T>): Promise<T> {
  try {
    return await task;
  } catch (error) {
    if (error instanceof ApiError) {
      throw new Response(JSON.stringify(error.body), {
        status: error.status,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
    throw error;
  }
}

function endpoint(request: Request, path: string): URL {
  const base = typeof window === "undefined" ? process.env.API_INTERNAL_URL : undefined;
  return new URL(path, base || new URL(request.url).origin);
}

async function parseError(response: Response): Promise<ApiErrorBody> {
  const fallback: ApiErrorBody = { error: response.statusText || "Не вдалося виконати запит", code: "internal_error" };
  if (!response.headers.get("content-type")?.includes("application/json")) return fallback;
  try {
    return { ...fallback, ...(await response.json()) };
  } catch {
    return fallback;
  }
}

export async function apiResponse(
  request: Request,
  path: string,
  init: RequestInit & { allow?: number[] } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase())) {
    headers.set("origin", new URL(request.url).origin);
  }

  let response: Response;
  try {
    response = await fetch(endpoint(request, path), { ...init, headers, redirect: "manual" });
  } catch (cause) {
    const error = new ApiError(503, { error: "API тимчасово недоступний", code: "internal_error" });
    error.cause = cause;
    throw error;
  }
  if (!response.ok && !init.allow?.includes(response.status)) {
    throw new ApiError(response.status, await parseError(response), response.headers.get("retry-after") ?? undefined);
  }
  return response;
}

export async function api<T>(
  request: Request,
  path: string,
  init: RequestInit & { allow?: number[] } = {},
): Promise<T> {
  const response = await apiResponse(request, path, init);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const query = (path: string, values: Record<string, string | number | boolean | null | undefined>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  const encoded = params.toString();
  return encoded ? `${path}?${encoded}` : path;
};

export async function getCurrentUser(request: Request): Promise<User | null> {
  if (!request.headers.get("cookie")) return null;
  try {
    return await api<User>(request, "/api/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export const updateProfile = (request: Request, body: ProfileUpdate) =>
  api<User>(request, "/api/me", { method: "PATCH", body: JSON.stringify(body) });

export const getProviders = (request: Request) =>
  api<{ providers: Provider[] }>(request, "/api/auth/providers");

export const getIdeas = (request: Request, filters: Record<string, string | number | undefined>) =>
  api<{ items: IdeaCard[]; nextCursor?: string | null }>(request, query("/api/ideas", filters));

export const getEvents = (request: Request, from?: string, to?: string) =>
  api<{ items: IdeaCard[] }>(request, query("/api/events", { from, to }));

export const getIdea = (request: Request, slug: string) =>
  api<IdeaView>(request, `/api/ideas/${encodeURIComponent(slug)}`);

export const getThread = (request: Request, slug: string) =>
  api<Thread>(request, `/api/ideas/${encodeURIComponent(slug)}/thread`);

export async function getNextIdea(request: Request, slug: string) {
  try {
    return await api<Pick<IdeaCard, "slug" | "title" | "summary" | "category">>(
      request,
      `/api/ideas/${encodeURIComponent(slug)}/next`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export const getProfile = (request: Request, handle: string) =>
  api<PublicProfile>(request, `/api/users/${encodeURIComponent(handle)}`);

export const createIdea = (request: Request, body: IdeaCreate) =>
  api<IdeaView>(request, "/api/ideas", { method: "POST", body: JSON.stringify(body) });

export const vote = (request: Request, slug: string, remove = false) =>
  api<{ votes: number; voted: boolean; votedWeight?: number }>(request, `/api/ideas/${encodeURIComponent(slug)}/vote`, {
    method: remove ? "DELETE" : "PUT",
  });

export const participate = (request: Request, slug: string, state?: string, role?: string) =>
  api<{ participation: { state: string; role?: string } | null; participants: number }>(
    request,
    `/api/ideas/${encodeURIComponent(slug)}/participation`,
    state ? { method: "PUT", body: JSON.stringify({ state, ...(role ? { role } : {}) }) } : { method: "DELETE" },
  );

export const getParticipants = (request: Request, slug: string) =>
  api<{ items: Participant[] }>(request, `/api/ideas/${encodeURIComponent(slug)}/participants`);

export const decideParticipant = (request: Request, slug: string, handle: string, decision: "accept" | "decline") =>
  api<{ handle: string; state: string }>(
    request,
    `/api/ideas/${encodeURIComponent(slug)}/participants/${encodeURIComponent(handle)}/${decision}`,
    { method: "POST" },
  );

export const createPost = (request: Request, slug: string, body: string, parentId?: string) =>
  api(request, `/api/ideas/${encodeURIComponent(slug)}/posts`, {
    method: "POST",
    body: JSON.stringify({ body, ...(parentId ? { parentId } : {}) }),
  });

export const reportIdea = (request: Request, slug: string, reason: string) =>
  api<void>(request, `/api/ideas/${encodeURIComponent(slug)}/report`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });

export const getNotifications = (request: Request, cursor?: string, unread?: boolean) =>
  api<{ items: Notification[]; nextCursor?: string | null; unread: number }>(
    request,
    query("/api/me/notifications", { cursor, unread, limit: 20 }),
  );

export const markNotificationsRead = (request: Request, ids?: string[]) =>
  api<{ updated: number; unread: number }>(request, "/api/me/notifications/read", {
    method: "POST",
    body: JSON.stringify(ids ? { ids } : { all: true }),
  });

export const getModerationQueue = (request: Request, state?: string, cursor?: string) =>
  api<{ items: QueueItem[]; nextCursor?: string | null }>(
    request,
    query("/api/moderation/queue", { state, cursor, limit: 20 }),
  );

export const decideModeration = (request: Request, id: string, decision: string, note?: string) =>
  api<void>(request, `/api/moderation/ideas/${encodeURIComponent(id)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, ...(note ? { note } : {}) }),
  });
