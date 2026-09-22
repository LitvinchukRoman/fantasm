import { NextRequest, NextResponse } from "next/server";
import { ACCESS_COOKIE, clearAuthCookies, revokeSession } from "@/lib/session";

export async function POST(req: NextRequest) {
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  if (access) await revokeSession(access);
  const res = NextResponse.json({ ok: true });
  clearAuthCookies(res);
  return res;
}
