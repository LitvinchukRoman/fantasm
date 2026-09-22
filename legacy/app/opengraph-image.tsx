import { createOgResponse, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og";

export const alt = "NaUKMA Ideas — платформа ідей спільноти";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// Render on demand, not at build time: Satori is far too slow under the CI's
// QEMU arm64 emulation (>60s/image → static export timeout).
export const dynamic = "force-dynamic";

/**
 * Default site-wide Open Graph card (homepage + any route without its own).
 * Idea and guide pages override this with their own cards.
 */
export default function OgImage() {
  return createOgResponse({
    kicker: "Спільнота НаУКМА",
    title: "Ідеї, що стають командами",
    subtitle:
      "Публікуй стартапи, пет-проєкти та події. Збирай голоси й однодумців Києво-Могилянської академії.",
  });
}
