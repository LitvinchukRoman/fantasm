import { getIdea } from "@/lib/api";
import { createOgResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const alt = "NaUKMA Ideas";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** Dynamic Open Graph card per idea. */
export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const idea = await getIdea(slug);
  return createOgResponse({
    kicker: "Ідея спільноти",
    title: idea?.title ?? "NaUKMA Ideas",
    subtitle: (idea?.summary ?? "Платформа ідей спільноти НаУКМА").slice(0, 150),
  });
}
