import { HUB_SLUGS, HUBS, getArticle, type HubSlug } from "@/lib/content";
import { createOgResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const alt = "NaUKMA Ideas — гайд";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// Render on demand, not at build time: Satori is far too slow under the CI's
// QEMU arm64 emulation (>60s/image → static export timeout). Crawlers cache the
// result, so runtime cost is negligible.
export const dynamic = "force-dynamic";

export default async function OgImage({ params }: { params: Promise<{ hub: string; slug: string }> }) {
  const { hub, slug } = await params;
  const doc = (HUB_SLUGS as readonly string[]).includes(hub) ? getArticle(hub as HubSlug, slug) : null;
  return createOgResponse({
    kicker: (HUBS as Record<string, { label: string }>)[hub]?.label ?? "Гайд",
    title: doc?.frontmatter.title ?? "Гайди NaUKMA Ideas",
    subtitle: doc?.frontmatter.description?.slice(0, 150),
  });
}
