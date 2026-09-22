"use client";

import { useState } from "react";
import { Link } from "@/lib/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, LogOut } from "lucide-react";
import { api } from "@/lib/client-api";
import { useMe } from "@/lib/use-me";
import type { Me, NotificationItem } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { timeAgo } from "@/lib/format";

export default function MePage() {
  const { data: me, isLoading } = useMe();

  if (isLoading) {
    return (
      <div className="space-y-4 pb-10">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="pt-10">
        <EmptyState
          title="Ви не увійшли"
          description="Увійдіть, щоб редагувати профіль і бачити сповіщення."
          actionHref="/login?next=/me"
          actionLabel="Увійти"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-h1">Кабінет</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await fetch("/auth/logout", { method: "POST" });
            window.location.href = "/";
          }}
        >
          <LogOut className="size-4" /> Вийти
        </Button>
      </div>

      <ProfileForm me={me} />
      <Notifications />
    </div>
  );
}

function ProfileForm({ me }: { me: Me }) {
  const qc = useQueryClient();
  const { data: faculties } = useQuery<string[]>({
    queryKey: ["faculties"],
    queryFn: () => api.get<string[]>("/api/v1/meta/faculties"),
    staleTime: Infinity,
  });

  const [name, setName] = useState(me.name);
  const [handle, setHandle] = useState(me.handle);
  const [bio, setBio] = useState(me.bio ?? "");
  const [faculty, setFaculty] = useState(me.faculty ?? "");
  const [emailEnabled, setEmailEnabled] = useState(me.emailEnabled);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setError(null);
    try {
      await api.patch<Me>("/api/v1/me", { name, handle, bio, faculty: faculty || null, emailEnabled });
      await qc.invalidateQueries({ queryKey: ["me"] });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Помилка збереження");
    }
  }

  return (
    <Card level={2} className="p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-4">
        <Avatar name={me.name} src={me.avatarUrl} size="lg" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{me.name}</span>
            {me.verifiedMohylian && <VerifiedBadge faculty={me.faculty} showLabel />}
          </div>
          <p className="text-sm text-[color:var(--ink-3)]">
            {me.email} · {me.karma} карми
          </p>
        </div>
      </div>

      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Імʼя">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} required />
        </Labeled>
        <Labeled label="Нікнейм" hint="a-z, цифри, дефіс">
          <input className="input" value={handle} onChange={(e) => setHandle(e.target.value)} pattern="[a-z0-9](?:[a-z0-9\-]{1,38}[a-z0-9])?" required />
        </Labeled>
        <Labeled label="Про себе" className="sm:col-span-2">
          <textarea className="input resize-y" rows={3} maxLength={512} value={bio} onChange={(e) => setBio(e.target.value)} />
        </Labeled>
        {me.verifiedMohylian && (
          <Labeled label="Факультет">
            <select className="input" value={faculty} onChange={(e) => setFaculty(e.target.value)}>
              <option value="">— не вказано —</option>
              {(faculties ?? []).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Labeled>
        )}
        <label className="flex items-center gap-2 self-end text-sm">
          <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
          Отримувати email-сповіщення
        </label>

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Зберігаємо…" : "Зберегти"}
          </Button>
          {status === "saved" && (
            <span className="inline-flex items-center gap-1 text-sm text-[color:var(--success)]">
              <Check className="size-4" /> Збережено
            </span>
          )}
          {error && <span className="text-sm text-[color:var(--danger)]">{error}</span>}
        </div>
      </form>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 12px;
          padding: 0.6rem 0.85rem;
          background: var(--surface-1);
          border: 1px solid var(--line);
          outline: none;
          color: var(--ink);
          transition: border-color var(--dur-1);
        }
        :global(.input:hover) {
          border-color: var(--line-strong);
        }
        :global(.input:focus-visible) {
          border-color: var(--accent);
          outline: 2px solid color-mix(in oklab, var(--accent) 45%, transparent);
          outline-offset: 0;
        }
      `}</style>
    </Card>
  );
}

function Notifications() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<NotificationItem[]>({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationItem[]>("/api/v1/notifications"),
  });

  async function markAll() {
    await api.post("/api/v1/notifications/read-all");
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["notifications"] }),
      qc.invalidateQueries({ queryKey: ["me"] }),
    ]);
  }

  return (
    <Card level={1} className="p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-h2 flex items-center gap-2">
          <Bell className="size-5" /> Сповіщення
        </h2>
        {(data?.length ?? 0) > 0 && (
          <Button variant="ghost" size="sm" onClick={markAll}>
            Прочитати всі
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <p className="py-6 text-center text-sm text-[color:var(--ink-3)]">Поки що немає сповіщень</p>
      ) : (
        <ul className="space-y-2">
          {data!.map((n) => {
            const body = (
              <div
                className={`rounded-xl border border-[var(--line)] p-3 text-sm ${
                  n.read ? "opacity-60" : "bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]"
                }`}
              >
                <p>{n.message}</p>
                <p className="mt-1 text-xs text-[color:var(--ink-3)]">{timeAgo(n.createdAt)}</p>
              </div>
            );
            return (
              <li key={n.id}>{n.link ? <Link href={n.link}>{body}</Link> : body}</li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Labeled({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-[color:var(--ink-3)]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
