import "server-only";
import type { NextResponse } from "next/server";
import { API_ORIGIN } from "./api";

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";

export interface TokenPair {
  token: string;
  refreshToken: string;
  accessExpiresIn: number;
  refreshExpiresIn: number;
}

const secure = process.env.NODE_ENV === "production";

/**
 * Write the httpOnly session cookies onto a NextResponse. SameSite=Lax + Secure
 * (in prod); the API additionally verifies request origin for state-changing
 * calls, so this is our CSRF posture for cookie auth.
 */
export function writeAuthCookies(res: NextResponse, pair: TokenPair): void {
  res.cookies.set(ACCESS_COOKIE, pair.token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: pair.accessExpiresIn,
  });
  res.cookies.set(REFRESH_COOKIE, pair.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: pair.refreshExpiresIn,
  });
}

export function clearAuthCookies(res: NextResponse): void {
  res.cookies.set(ACCESS_COOKIE, "", { path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", { path: "/", maxAge: 0 });
}

/** Exchange the one-time OAuth code for a token pair (server-to-server). */
export async function exchangeCode(code: string): Promise<TokenPair> {
  const res = await fetch(`${API_ORIGIN}/api/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`exchange failed: ${res.status}`);
  return (await res.json()) as TokenPair;
}

/** Rotate the refresh token for a new pair. */
export async function refreshTokens(refreshToken: string): Promise<TokenPair> {
  const res = await fetch(`${API_ORIGIN}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
  return (await res.json()) as TokenPair;
}

/** Best-effort server-side revocation of all refresh tokens for the session. */
export async function revokeSession(accessToken: string): Promise<void> {
  try {
    await fetch(`${API_ORIGIN}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    /* ignore — cookies are cleared regardless */
  }
}
