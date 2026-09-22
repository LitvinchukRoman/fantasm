import { cn } from "@/lib/utils";

/** Shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl bg-black/5 dark:bg-white/5",
        "after:absolute after:inset-0 after:-translate-x-full after:animate-[shimmer_1.6s_infinite]",
        "after:bg-gradient-to-r after:from-transparent after:via-white/20 after:to-transparent",
        className,
      )}
    />
  );
}
