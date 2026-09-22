"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { api, ApiError } from "@/lib/client-api";

/** Minimal report control; opens a prompt and posts a report. */
export function ReportButton({ ideaId }: { ideaId: number }) {
  const [done, setDone] = useState(false);

  async function report() {
    const reason = window.prompt("Чому ви скаржитеся на цю ідею?");
    if (!reason) return;
    try {
      await api.post(`/api/v1/ideas/${ideaId}/report`, { reason });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) window.location.href = "/login";
    }
  }

  return (
    <button
      type="button"
      onClick={report}
      disabled={done}
      className="inline-flex items-center gap-1 text-xs text-[color:var(--ink-3)] transition-colors hover:text-[color:var(--danger)] disabled:opacity-50"
    >
      <Flag className="size-3.5" /> {done ? "Дякуємо" : "Поскаржитися"}
    </button>
  );
}
