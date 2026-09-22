"use client";

/**
 * Browser-side API client. Calls are same-origin (`/api/*` → Caddy → Spring in
 * prod, or Next rewrite → Spring in dev), so the httpOnly access cookie rides
 * along automatically. On a 401 we transparently hit the BFF refresh route
 * (which rotates cookies) once and retry.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  // Collapse concurrent 401s into a single refresh round-trip.
  if (!refreshing) {
    refreshing = fetch("/auth/refresh", { method: "POST" })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

async function request<T>(path: string, init: RequestInit, retry = true): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    credentials: "same-origin",
  });

  if (res.status === 401 && retry) {
    const ok = await refreshSession();
    if (ok) return request<T>(path, init, false);
  }
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
