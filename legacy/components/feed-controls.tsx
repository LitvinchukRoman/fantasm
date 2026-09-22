"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Segmented } from "@/components/ui/segmented";
import { cn, SORT_LABELS, CATEGORY_LABELS } from "@/lib/utils";
import type { FeedSort } from "@/lib/types";

const SORTS: FeedSort[] = ["HOT", "NEW", "TOP"];
const CATEGORIES = ["STARTUP", "PROJECT", "EVENT", "COMMUNITY", "OTHER"];

/** Sort segmented control + category / campus filters that drive the URL query. */
export function FeedControls() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const sort = (params.get("sort") as FeedSort) ?? "HOT";
  const category = params.get("category") ?? "";
  const campus = params.get("campus") === "true";

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Segmented
        aria-label="Сортування"
        options={SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
        value={sort}
        onChange={(s) => setParam("sort", s === "HOT" ? null : s)}
      />

      <div className="flex flex-wrap gap-2">
        <FilterChip active={!category} onClick={() => setParam("category", null)}>
          Усі
        </FilterChip>
        {CATEGORIES.map((c) => (
          <FilterChip key={c} active={category === c} onClick={() => setParam("category", c)}>
            {CATEGORY_LABELS[c]}
          </FilterChip>
        ))}
        <FilterChip
          active={campus}
          tone="seal"
          onClick={() => {
            const next = new URLSearchParams(params.toString());
            if (campus) {
              next.delete("campus");
            } else {
              next.set("campus", "true");
              next.delete("category");
            }
            router.push(`${pathname}?${next.toString()}`, { scroll: false });
          }}
        >
          Могилянка
        </FilterChip>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  tone = "ink",
  onClick,
  children,
}: {
  active: boolean;
  tone?: "ink" | "seal";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-[var(--dur-1)]",
        active && tone === "ink" && "border-transparent bg-[var(--btn-primary-bg)] text-[color:var(--btn-primary-fg)]",
        active && tone === "seal" && "border-transparent bg-[var(--seal)] text-[color:var(--surface-1)]",
        !active && "border-[var(--line)] bg-[var(--surface-1)] text-[color:var(--ink-2)] hover:border-[var(--line-strong)] hover:text-[color:var(--ink)]",
      )}
    >
      {children}
    </button>
  );
}
