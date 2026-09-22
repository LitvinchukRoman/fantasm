import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** Brand palette flattened to sRGB for Satori (which lacks OKLCH). */
const C = {
  ink: "#14131b",
  ink2: "#1c1b25",
  paper: "#f4f2ee",
  paperDim: "#b8b4ad",
  accent: "#f2b544", // amber = "light of an idea"
  accentDim: "#c98f2d",
  line: "rgba(255,255,255,0.10)",
};

/** Four-point spark — the brand mark (replaces the lightbulb/emoji). */
export const SPARK_PATH =
  "M12 1.6c.9 6 3.9 8.9 9.9 9.9c0 .2 0 .8 0 1c-6 1-9 3.9-9.9 9.9c-.2 0-.8 0-1 0c-1-6-3.9-9-9.9-9.9c0-.2 0-.8 0-1c6-1 8.9-3.9 9.9-9.9c.2 0 .8 0 1 0Z";

let fontCache: { name: string; data: Buffer; weight: 400 | 600 | 700; style: "normal" }[] | null =
  null;

async function loadFonts() {
  if (fontCache) return fontCache;
  const dir = join(process.cwd(), "lib", "og-assets");
  const [displayBold, displaySemi, textReg] = await Promise.all([
    readFile(join(dir, "FixelDisplay-Bold.ttf")),
    readFile(join(dir, "FixelDisplay-SemiBold.ttf")),
    readFile(join(dir, "FixelText-Regular.ttf")),
  ]);
  fontCache = [
    { name: "Fixel Display", data: displayBold, weight: 700, style: "normal" },
    { name: "Fixel Display", data: displaySemi, weight: 600, style: "normal" },
    { name: "Fixel Text", data: textReg, weight: 400, style: "normal" },
  ];
  return fontCache;
}

export interface OgOptions {
  /** Small eyebrow above the title (e.g. cluster name or "Гайд"). */
  kicker?: string;
  title: string;
  subtitle?: string;
}

/** Renders the shared, branded OG card. Reused by the homepage and every SEO page. */
export async function createOgResponse({ kicker, title, subtitle }: OgOptions) {
  const fonts = await loadFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: C.ink,
          backgroundImage: `radial-gradient(1100px 700px at 6% -12%, ${C.accentDim}55, transparent 60%)`,
          color: C.paper,
          fontFamily: "Fixel Text",
        }}
      >
        {/* Wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: C.ink2,
              border: `1px solid ${C.line}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill={C.accent}>
              <path d={SPARK_PATH} />
            </svg>
          </div>
          <div style={{ fontSize: 30, fontWeight: 600, fontFamily: "Fixel Display" }}>
            NaUKMA Ideas
          </div>
        </div>

        {/* Message */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          {kicker ? (
            <div
              style={{
                fontSize: 26,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: C.accent,
                fontWeight: 600,
              }}
            >
              {kicker}
            </div>
          ) : null}
          <div
            style={{
              fontSize: title.length > 48 ? 66 : 82,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: -1.5,
              fontFamily: "Fixel Display",
              maxWidth: 1010,
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div style={{ fontSize: 32, lineHeight: 1.32, color: C.paperDim, maxWidth: 950 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 26,
            color: C.paperDim,
            borderTop: `1px solid ${C.line}`,
            paddingTop: 26,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r="6" fill={C.accent} />
          </svg>
          ideas.naukma.com
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
