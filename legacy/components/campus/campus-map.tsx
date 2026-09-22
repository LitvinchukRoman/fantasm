"use client";

import { useState } from "react";
import Image from "next/image";
import { BUILDINGS, type Building } from "@/lib/campus";
import { CAMPUS_GEO, CAMPUS_VB } from "@/lib/campus-geo";
import { Sheet } from "@/components/ui/sheet";
import { Cover } from "@/components/ui/cover";
import { cn } from "@/lib/utils";

const GEO_BY_NUM = new Map(CAMPUS_GEO.map((g) => [g.num, g]));
// Draw order: bigger/back structures first so smaller badges stay legible.
const ORDERED = [...BUILDINGS].sort((a, b) => Number(b.num === "КМЦ") - Number(a.num === "КМЦ"));

/**
 * Interactive schematic of the NaUKMA campus, built from the official scheme:
 * real building footprints (traced) + numbered badges. Two synced surfaces —
 * the SVG map (pointer) and a legend list of <button>s (keyboard + mobile) —
 * both open the same detail Sheet. `interactive={false}` → decorative mini-map.
 */
export function CampusMap({
  interactive = true,
  className,
}: {
  interactive?: boolean;
  className?: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active: Building | null = BUILDINGS.find((b) => b.id === activeId) ?? null;

  const map = (
    <svg
      viewBox={`0 0 ${CAMPUS_VB.w} ${CAMPUS_VB.h}`}
      className="h-auto w-full select-none"
      role="img"
      aria-label="Схема корпусів кампусу НаУКМА"
    >
      {/* faint street context */}
      <g className="fill-[color:var(--ink-3)]" opacity={0.5} style={{ fontSize: 2.3 }}>
        <text x={2} y={41.5}>вул. Почайнинська</text>
        <text x={2} y={74}>вул. Волоська</text>
        <text x={2} y={139}>Контрактова площа</text>
      </g>

      {ORDERED.map((b) => {
        const geo = GEO_BY_NUM.get(b.num);
        if (!geo) return null;
        const isActive = b.id === activeId;
        const dim = activeId !== null && !isActive;
        return (
          <g
            key={b.id}
            className={cn("group outline-none", interactive && "cursor-pointer")}
            {...(interactive
              ? {
                  role: "button",
                  tabIndex: 0,
                  "aria-label": b.name,
                  onClick: () => setActiveId(b.id),
                  onKeyDown: (e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveId(b.id);
                    }
                  },
                }
              : { "aria-hidden": true })}
          >
            <path
              d={geo.d}
              className={cn(
                "transition-[fill,fill-opacity] duration-[var(--dur-1)]",
                isActive
                  ? "fill-[var(--accent)]"
                  : "fill-[var(--ink)] group-hover:fill-[var(--accent)] group-focus-visible:fill-[var(--accent)]",
              )}
              style={{ fillOpacity: dim ? 0.4 : isActive ? 1 : 0.9 }}
            />
            {/* numbered badge */}
            <g style={{ pointerEvents: "none" }}>
              <rect
                x={geo.x - (b.num.length > 2 ? 4.2 : 2.9)}
                y={geo.y - 2.2}
                width={b.num.length > 2 ? 8.4 : 5.8}
                height={4.4}
                rx={2.2}
                className="fill-[var(--bg)]"
                stroke="var(--ink)"
                strokeWidth={0.4}
                strokeOpacity={0.25}
              />
              <text
                x={geo.x}
                y={geo.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-[color:var(--ink)] font-semibold"
                style={{ fontSize: b.num.length > 2 ? 2.5 : 3 }}
              >
                {b.num}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );

  if (!interactive) {
    return <div className={cn("relative", className)}>{map}</div>;
  }

  return (
    <div className={cn("grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]", className)}>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] p-4">{map}</div>

      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
        {BUILDINGS.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              onClick={() => setActiveId(b.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors duration-[var(--dur-1)]",
                activeId === b.id
                  ? "border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_12%,transparent)]"
                  : "border-[var(--line)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]",
              )}
            >
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--ink)] text-[11px] font-semibold text-[var(--bg)]">
                {b.num}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-[color:var(--ink)]">{b.name}</span>
                <span className="block truncate text-xs text-[color:var(--ink-2)]">{b.short}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Sheet open={!!active} onClose={() => setActiveId(null)} title={active?.name}>
        {active && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-[var(--line)]">
              {active.photo ? (
                <Image
                  src={active.photo.src}
                  alt={active.name}
                  width={active.photo.w}
                  height={active.photo.h}
                  unoptimized
                  className="h-auto w-full"
                />
              ) : (
                <Cover seed={active.id} className="grid aspect-[16/10] w-full place-items-center">
                  <span className="text-5xl font-semibold text-white/90">{active.num}</span>
                </Cover>
              )}
            </div>
            <p className="text-sm leading-relaxed text-[color:var(--ink-2)]">{active.body}</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}
