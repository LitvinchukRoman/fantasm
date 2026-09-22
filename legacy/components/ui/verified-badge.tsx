import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The "Могилянець" seal for verified NaUKMA users — a scalloped stamp in the
 * seal colour. The campus advantage becomes visible as a mark, not just text.
 */
export function VerifiedBadge({
  faculty,
  className,
  showLabel = false,
  size = 18,
}: {
  faculty?: string | null;
  className?: string;
  showLabel?: boolean;
  size?: number;
}) {
  return (
    <span
      title={faculty ? `Могилянець — ${faculty}` : "Верифікований могилянець"}
      className={cn("inline-flex items-center gap-1.5 text-[color:var(--seal)]", className)}
    >
      <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
        <svg viewBox="0 0 24 24" className="absolute inset-0 size-full" fill="currentColor" aria-hidden>
          {/* 12-lobed scalloped seal */}
          <path d="M12 1l2.1 1.4L16.6 2l1.2 2.3 2.5.5.2 2.6 2 1.6-1 2.4 1 2.4-2 1.6-.2 2.6-2.5.5L16.6 22l-2.5-.4L12 23l-2.1-1.4-2.5.4-1.2-2.3-2.5-.5-.2-2.6-2-1.6 1-2.4-1-2.4 2-1.6.2-2.6 2.5-.5L7.4 2l2.5.4z" />
        </svg>
        <Check className="relative size-[55%] text-[color:var(--surface-1)]" strokeWidth={3} aria-hidden />
      </span>
      {showLabel && <span className="text-xs font-semibold">Могилянець</span>}
      <span className="sr-only">Верифікований могилянець</span>
    </span>
  );
}
