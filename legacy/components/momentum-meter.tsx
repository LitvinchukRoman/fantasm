import { Flame } from "lucide-react";
import type { IdeaCard, IdeaDetail } from "@/lib/types";
import { momentum } from "@/lib/momentum";
import { cn } from "@/lib/utils";

const BAR: Record<string, string> = {
  accent: "bg-[var(--accent)]",
  seal: "bg-[var(--seal)]",
  neutral: "bg-[var(--ink-3)]",
};
const TEXT: Record<string, string> = {
  accent: "text-[color:var(--accent-ink)]",
  seal: "text-[color:var(--seal)]",
  neutral: "text-[color:var(--ink-2)]",
};

/** The "moment" of an idea — a labelled meter instead of a raw score. */
export function MomentumMeter({
  idea,
  compact = false,
}: {
  idea: IdeaCard | IdeaDetail;
  compact?: boolean;
}) {
  const m = momentum(idea);
  return (
    <div className={cn("flex items-center gap-2", compact ? "text-xs" : "text-sm")}>
      <span className={cn("inline-flex items-center gap-1 font-medium", TEXT[m.tone])}>
        <Flame className={compact ? "size-3.5" : "size-4"} /> {m.label}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--ink)_10%,transparent)]">
        <span className={cn("block h-full rounded-full", BAR[m.tone])} style={{ width: `${m.pct}%` }} />
      </span>
    </div>
  );
}
