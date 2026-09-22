"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
  };
}

/** Ticking countdown to an event. Hidden once the event has started. */
export function Countdown({ to }: { to: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null; // avoid hydration mismatch
  const diff = target - now;
  if (diff <= 0) return <div className="text-caption text-[color:var(--accent-ink)]">Подія триває / завершилась</div>;

  const { d, h, m } = parts(diff);
  const cells: [number, string][] = [
    [d, "дн"],
    [h, "год"],
    [m, "хв"],
  ];
  return (
    <div className="flex gap-2">
      {cells.map(([v, label]) => (
        <div
          key={label}
          className="flex min-w-14 flex-col items-center rounded-xl border border-[var(--line)] bg-[var(--surface-1)] px-2 py-2"
        >
          <span className="text-h3 tabnums leading-none">{v}</span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-[color:var(--ink-3)]">{label}</span>
        </div>
      ))}
    </div>
  );
}
