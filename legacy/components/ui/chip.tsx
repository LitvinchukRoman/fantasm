import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef } from "react";

/**
 * Small pill for tags, categories and counters. Pills are reserved for chips
 * and the segmented control — everything else uses 8–24px radii.
 *  - neutral  quiet surface tint
 *  - accent   the single amber hue (use sparingly)
 *  - seal     the Mohylian privilege marker
 */
// New tones + legacy aliases (default→neutral, brand→accent, campus→seal).
type ChipTone = "neutral" | "accent" | "seal" | "default" | "brand" | "campus";

export function Chip({
  tone = "neutral",
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"span"> & { tone?: ChipTone }) {
  const t = tone === "default" ? "neutral" : tone === "brand" ? "accent" : tone === "campus" ? "seal" : tone;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabnums",
        t === "neutral" &&
          "bg-[color-mix(in_oklab,var(--ink)_7%,transparent)] text-[color:var(--ink-2)]",
        t === "accent" &&
          "bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[color:var(--accent-ink)]",
        t === "seal" &&
          "bg-[color-mix(in_oklab,var(--seal)_16%,transparent)] text-[color:var(--seal)]",
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
