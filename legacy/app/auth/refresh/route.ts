import { NextRequest, NextResponse } from "next/server";
import { REFRESH_COOKIE, refreshTokens, writeAuthCookies, clearAuthCookies } from "@/lib/session";

/** Client fetch wrapper calls this on a 401 to rotate the session cookies. */
export async function POST(req: NextRequest) {
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (!refresh) {
    const res = NextResponse.json({ error: "no_refresh" }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }
  try {
    const pair = await refreshTokens(refresh);
    const res = NextResponse.json({ ok: true });
    writeAuthCookies(res, pair);
    return res;
  } catch {
    const res = NextResponse.json({ error: "refresh_failed" }, { status: 401 });
    clearAuthCookies(res);
    return res;
  }
}
