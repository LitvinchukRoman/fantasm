"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/link";
import { ShieldCheck, Flag, BarChart3 } from "lucide-react";
import { api } from "@/lib/client-api";
import { useMe } from "@/lib/use-me";
import type { IdeaCard } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { timeAgo } from "@/lib/format";

interface ReportRow {
  id: number;
  ideaId: number;
  reason: string | null;
  status: string;
  createdAt: string;
}

type Decision = "APPROVE" | "HIDE" | "REJECT" | "RESTORE";

export default function AdminPage() {
  const { data: me, isLoading } = useMe();

  if (isLoading) return <Skeleton className="mt-6 h-64 w-full" />;

  if (!me || (me.role !== "ADMIN" && me.role !== "MODERATOR")) {
    return (
      <div className="pt-10">
        <EmptyState title="Немає доступу" description="Ця сторінка лише для модераторів." actionHref="/" actionLabel="На головну" />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10">
      <h1 className="text-h1 flex items-center gap-2">
        <ShieldCheck className="size-6 text-[color:var(--accent-ink)]" /> Модерація
      </h1>
      <Stats />
      <Queue />
      <Reports />
    </div>
  );
}

function Stats() {
  const { data } = useQuery<Record<string, number>>({
    queryKey: ["admin-stats"],
    queryFn: () => api.get("/api/v1/admin/stats"),
  });
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) return null;
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {entries.map(([k, v]) => (
        <Card key={k} level={1} className="p-4">
          <p className="text-xs uppercase tracking-wide text-[color:var(--ink-3)]">{k}</p>
          <p className="mt-1 flex items-center gap-1.5 text-2xl font-bold tabular-nums">
            <BarChart3 className="size-4 text-[color:var(--accent-ink)]" /> {v}
          </p>
        </Card>
      ))}
    </section>
  );
}

function Queue() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<IdeaCard[]>({
    queryKey: ["admin-queue"],
    queryFn: () => api.get("/api/v1/admin/moderation/queue"),
  });

  async function decide(ideaId: number, decision: Decision) {
    await api.post(`/api/v1/admin/moderation/${ideaId}/decide`, { decision });
    await qc.invalidateQueries({ queryKey: ["admin-queue"] });
  }

  return (
    <section className="space-y-4">
      <h2 className="text-h2">Черга модерації</h2>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (data?.length ?? 0) === 0 ? (
        <p className="text-sm text-[color:var(--ink-3)]">Черга порожня 🎉</p>
      ) : (
        <div className="space-y-3">
          {data!.map((idea) => (
            <Card key={idea.id} level={2} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <Link href={`/ideas/${idea.slug}`} className="font-semibold hover:underline">
                  {idea.title}
                </Link>
                <p className="line-clamp-1 text-sm text-[color:var(--ink-2)]">{idea.summary}</p>
                <p className="mt-1 text-xs text-[color:var(--ink-3)]">
                  {idea.author.name} · {timeAgo(idea.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decide(idea.id, "APPROVE")}>
                  Схвалити
                </Button>
                <Button size="sm" variant="ghost" onClick={() => decide(idea.id, "HIDE")}>
                  Сховати
                </Button>
                <Button size="sm" variant="ghost" onClick={() => decide(idea.id, "REJECT")}>
                  Відхилити
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function Reports() {
  const { data, isLoading } = useQuery<ReportRow[]>({
    queryKey: ["admin-reports"],
    queryFn: () => api.get("/api/v1/admin/reports"),
  });

  return (
    <section className="space-y-4">
      <h2 className="text-h2 flex items-center gap-2">
        <Flag className="size-5" /> Скарги
      </h2>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (data?.length ?? 0) === 0 ? (
        <p className="text-sm text-[color:var(--ink-3)]">Скарг немає</p>
      ) : (
        <div className="space-y-2">
          {data!.map((r) => (
            <Card key={r.id} level={1} className="flex items-center gap-3 p-3 text-sm">
              <Chip tone={r.status === "OPEN" ? "brand" : undefined}>{r.status}</Chip>
              <span className="flex-1">{r.reason ?? "— без причини —"}</span>
              <Link href={`/ideas`} className="text-xs text-[color:var(--accent-ink)]">
                ідея #{r.ideaId}
              </Link>
              <span className="text-xs text-[color:var(--ink-3)]">{timeAgo(r.createdAt)}</span>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
