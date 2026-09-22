/**
 * Minimal line illustrations (ink stroke + a single accent fill) for empty
 * states, login and 404. Deliberately spare — they add narrative without the
 * generic "3D blob" AI look.
 */
import { cn } from "@/lib/utils";

const box = "size-28 text-[color:var(--ink-3)]";
const common = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IlloEmptyFeed({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={cn(box, className)} {...common} aria-hidden>
      <rect x="24" y="30" width="72" height="18" rx="6" />
      <rect x="24" y="56" width="72" height="18" rx="6" />
      <rect x="24" y="82" width="48" height="18" rx="6" />
      <path d="M84 88l6 6 10-12" stroke="var(--accent)" />
    </svg>
  );
}

export function IlloNoEvents({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={cn(box, className)} {...common} aria-hidden>
      <rect x="26" y="30" width="68" height="64" rx="8" />
      <path d="M26 46h68M42 24v12M78 24v12" />
      <circle cx="60" cy="68" r="10" stroke="var(--accent)" />
      <path d="M60 62v6l4 3" stroke="var(--accent)" />
    </svg>
  );
}

export function IlloLogin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={cn(box, className)} {...common} aria-hidden>
      <circle cx="60" cy="48" r="16" />
      <path d="M34 92c2-14 12-22 26-22s24 8 26 22" />
      <path d="M60 40l3 6 6 .8-4.5 4.3 1 6.4-5.5-3-5.5 3 1-6.4L51 46.8l6-.8z" stroke="var(--accent)" />
    </svg>
  );
}

export function Illo404({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={cn(box, className)} {...common} aria-hidden>
      <circle cx="60" cy="60" r="34" />
      <path d="M48 52c0-6 5-10 12-10s12 4 12 11c0 6-6 8-9 11" stroke="var(--accent)" />
      <path d="M60 84h.01" />
    </svg>
  );
}

export function IlloOnboarding({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" className={cn(box, className)} {...common} aria-hidden>
      <path d="M60 26c8 6 12 14 12 24 0 8-5 12-5 18H53c0-6-5-10-5-18 0-10 4-18 12-24z" stroke="var(--accent)" />
      <path d="M52 92h16M55 100h10" />
    </svg>
  );
}
