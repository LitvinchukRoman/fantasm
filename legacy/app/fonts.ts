import localFont from "next/font/local";
import { JetBrains_Mono } from "next/font/google";

/**
 * Fixel by MacPaw (SIL OFL) — a Ukrainian-designed grotesque with full Cyrillic.
 * Self-hosted WOFF2, subset per weight. Display for headings, Text for body.
 * `adjustFontFallback` generates a size-matched fallback → ~0 CLS on swap.
 */
export const fixelDisplay = localFont({
  src: [
    { path: "./fonts/FixelDisplay-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "./fonts/FixelDisplay-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-fixel-display",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["Segoe UI", "system-ui", "sans-serif"],
});

export const fixelText = localFont({
  src: [
    { path: "./fonts/FixelText-Regular.woff2", weight: "400", style: "normal" },
    { path: "./fonts/FixelText-Medium.woff2", weight: "500", style: "normal" },
    { path: "./fonts/FixelText-SemiBold.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-fixel-text",
  display: "swap",
  adjustFontFallback: "Arial",
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
});

/** Monospace — reserved for tags (#slug) and code only. */
export const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-jetbrains",
  display: "swap",
});
