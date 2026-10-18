import type { ComponentProps, ReactNode } from "react";
import { Link, useLocation } from "react-router";
import { IconChevronDown } from "~/components/landing/icons";
import type { AdminHealth, AdminOverview } from "~/lib/api-types";

const RANGES = [
  { id: "7d", label: "7 днів" },
  { id: "30d", label: "30 днів" },
  { id: "90d", label: "90 днів" },
] as const;

export function PageHeading({ title, lede, aside }: { title: string; lede?: string; aside?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-4xl font-medium tracking-tight">{title}</h1>
        {lede && <p className="mt-2 max-w-xl text-sm text-[var(--color-text-muted)]">{lede}</p>}
      </div>
      {aside}
    </header>
  );
}

export function ChartPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6">
      <h2 className="text-lg font-medium tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function RangePicker() {
  const location = useLocation();
  const current = new URLSearchParams(location.search).get("range") ?? "30d";
  return (
    <nav aria-label="Період" className="flex gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-1 text-sm">
      {RANGES.map((range) => (
        <Link key={range.id} to={`${location.pathname}?range=${range.id}`} aria-current={current === range.id ? "page" : undefined}
          className={"rounded-full px-3.5 py-1.5 transition-[background-color,color] duration-150 ease-[var(--ease-out-expo)] " + (current === range.id ? "bg-[var(--color-surface-strong)] text-[var(--color-text)]" : "text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]")}>
          {range.label}
        </Link>
      ))}
    </nav>
  );
}

/** Нативний select у стилі пігулок: своя стрілка з відступом від краю. */
export function Select({ className = "", children, ...props }: ComponentProps<"select">) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <select
        {...props}
        className="w-full appearance-none rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)] py-2 pr-10 pl-4 text-sm text-[var(--color-text)] transition-colors duration-150 hover:border-[var(--color-text-faint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        {children}
      </select>
      <IconChevronDown className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-[var(--color-text-faint)]" />
    </span>
  );
}

const VERDICT: Record<AdminOverview["verdict"]["status"], string> = {
  growing: "bg-[var(--color-accent)]",
  falling: "bg-[var(--color-negative)]",
  steady: "bg-[var(--color-text-muted)]",
  insufficient: "bg-[var(--color-text-faint)]",
};

export function VerdictBanner({ verdict }: { verdict: AdminOverview["verdict"] }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-6">
      <p className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        <span aria-hidden="true" className={`size-2 rounded-full ${VERDICT[verdict.status]}`} />
        Стан платформи
      </p>
      <p className="mt-2 text-3xl font-medium tracking-tight text-balance">{verdict.summary}</p>
      {verdict.reasons.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm text-[var(--color-text-muted)]">
          {verdict.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
    </section>
  );
}

export function KpiCard({ label, value, previous, delta }: { label: string; value: number; previous: number; delta: number | null }) {
  const tone = delta == null || delta === 0 ? "text-[var(--color-text-faint)]" : delta > 0 ? "text-[var(--color-text-muted)]" : "text-[var(--color-negative)]";
  const arrow = delta == null || delta === 0 ? "" : delta > 0 ? "↑ " : "↓ ";
  const text = delta == null ? "немає попереднього періоду" : `${arrow}${Math.abs(Math.round(delta * 100))}% проти ${previous}`;
  return (
    <article className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">
      <p className="text-sm text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-3xl font-medium tracking-tight tabular-nums">{value}</p>
      <p className={`mt-2 text-xs ${tone}`}>{text}</p>
    </article>
  );
}

const HEALTH: Record<AdminHealth["status"], string> = { ok: "Працює", degraded: "Погіршено", down: "Не працює" };

export function HealthStrip({ health }: { health: AdminHealth }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-bg)] p-5 text-sm">
      <p className="font-medium">{HEALTH[health.status]}</p>
      <p className="mt-2 text-[var(--color-text-muted)]">
        Аптайм {Math.floor(health.uptimeSeconds / 3600)} год · p95 за годину {Math.round(health.hour.p95Ms)} мс · база {health.dbPingMs} мс · пул {health.dbPool.acquired}/{health.dbPool.max}
      </p>
      <p className="mt-1 text-[var(--color-text-muted)]">
        За добу {health.day.requests} запитів, з них 5xx {health.day.serverErrors}. Найстаріший кейс у черзі — {health.oldestQueueHours} год.
      </p>
      {health.reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-[var(--color-text-muted)]">
          {health.reasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
    </section>
  );
}

export function DataTable({ title, rows }: { title: string; rows: Array<{ key: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <h3 className="text-base font-medium">{title}</h3>
      <ul className="mt-4 space-y-3">
        {rows.length === 0 && <li className="text-sm text-[var(--color-text-muted)]">Поки порожньо</li>}
        {rows.map((row) => (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{row.key || "—"}</span>
              <span className="tabular-nums text-[var(--color-text-muted)]">{row.value}</span>
            </div>
            <div className="mt-1.5 h-px bg-[var(--color-border)]">
              <div className="h-px bg-[var(--color-text-muted)]" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
