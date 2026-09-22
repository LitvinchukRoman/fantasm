"use client";

import { motion } from "framer-motion";
import { useId } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Segmented control — the sliding "thumb" uses a shared layoutId so switching
 * feels physical instead of a hard colour flip. Pill radius is allowed here.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  "aria-label": ariaLabel,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative isolate rounded-full px-4 py-1.5 text-sm font-medium transition-colors duration-[var(--dur-1)]",
              active ? "text-[color:var(--btn-primary-fg)]" : "text-[color:var(--ink-2)] hover:text-[color:var(--ink)]",
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="absolute inset-0 -z-10 rounded-full bg-[var(--btn-primary-bg)]"
              />
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
