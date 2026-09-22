import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";

/**
 * On-demand ISR hook called by the Spring API when an idea changes. Lives
 * OUTSIDE /api (Caddy routes every /api/* to Spring in prod), and is guarded by
 * a shared secret in the x-revalidate-secret header.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-revalidate-secret");
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const slug = req.nextUrl.searchParams.get("slug");
  revalidateTag("feed");
  revalidateTag("events");
  if (slug) revalidateTag(`idea:${slug}`);
  return NextResponse.json({ revalidated: true, slug });
}
