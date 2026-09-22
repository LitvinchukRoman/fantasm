import { cn } from "@/lib/utils";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

const fieldBase =
  "w-full rounded-xl border border-[var(--line)] bg-[var(--surface-1)] px-4 py-2.5 text-[15px] text-[color:var(--ink)] " +
  "placeholder:text-[color:var(--ink-3)] transition-colors duration-[var(--dur-1)] " +
  "hover:border-[var(--line-strong)] focus:border-[var(--accent)] focus:outline-none " +
  "focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_45%,transparent)] disabled:opacity-50";

/** Optional label + hint/error wrapper shared by Input and Textarea. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-caption">{label}</span>}
      {children}
      {error ? (
        <span className="block text-xs text-[color:var(--danger)]">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-[color:var(--ink-3)]">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ className, ...rest }: ComponentPropsWithoutRef<"input">) {
  return <input className={cn(fieldBase, "h-11", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-28 resize-y leading-relaxed", className)} {...rest} />;
}
