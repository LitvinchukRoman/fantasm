import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, writeAuthCookies } from "@/lib/session";

/**
 * OAuth landing on the BFF. The Spring success handler redirected the browser
 * here with a single-use `code`; we swap it for a token pair server-side and set
 * httpOnly cookies, then bounce the user into the app. Tokens never touch the
 * browser directly.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const origin = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", origin));
  }
  try {
    const pair = await exchangeCode(code);
    const res = NextResponse.redirect(new URL("/", origin));
    writeAuthCookies(res, pair);
    return res;
  } catch {
    return NextResponse.redirect(new URL("/login?error=exchange_failed", origin));
  }
}
