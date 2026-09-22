import { cn } from "@/lib/utils";

/**
 * The brand mark — a four-point spark ("іскра"). Replaces the lucide lightbulb.
 * Used in nav, favicon, empty states, OG. Monochrome by default; pass
 * `accent` to fill with the amber accent (reserved for logo/seal contexts).
 */
export function Spark({
  className,
  accent = false,
  strokeOnly = false,
}: {
  className?: string;
  accent?: boolean;
  strokeOnly?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("size-5", className)}
      fill={strokeOnly ? "none" : accent ? "var(--accent)" : "currentColor"}
      stroke={strokeOnly ? "currentColor" : "none"}
      strokeWidth={strokeOnly ? 1.75 : 0}
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 1.6c.9 6 3.9 8.9 9.9 9.9c0 .2 0 .8 0 1c-6 1-9 3.9-9.9 9.9c-.2 0-.8 0-1 0c-1-6-3.9-9-9.9-9.9c0-.2 0-.8 0-1c6-1 8.9-3.9 9.9-9.9c.2 0 .8 0 1 0Z" />
    </svg>
  );
}
