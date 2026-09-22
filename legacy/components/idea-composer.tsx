"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/client-api";
import type { IdeaCategory, IdeaDetail } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useMe } from "@/lib/use-me";
import { CATEGORY_LABELS } from "@/lib/utils";

const CATEGORIES: IdeaCategory[] = ["STARTUP", "PROJECT", "EVENT", "COMMUNITY", "OTHER"];

export function IdeaComposer() {
  const router = useRouter();
  const { data: me } = useMe();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [category, setCategory] = useState<IdeaCategory>("PROJECT");
  const [tags, setTags] = useState("");
  const [ukmaOnly, setUkmaOnly] = useState(false);
  const [needsRoles, setNeedsRoles] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isEvent = category === "EVENT";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const idea = await api.post<IdeaDetail>("/api/v1/ideas", {
        title,
        summary,
        bodyMd,
        category,
        visibility: ukmaOnly ? "UKMA_ONLY" : "PUBLIC",
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        needsRoles: needsRoles || null,
        eventAt: isEvent && eventAt ? new Date(eventAt).toISOString() : null,
        eventLocation: isEvent ? eventLocation || null : null,
        capacity: isEvent && capacity ? Number(capacity) : null,
      });
      router.push(`/ideas/${idea.slug}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          window.location.href = "/login";
          return;
        }
        setError(err.message);
      } else {
        setError("Не вдалося створити ідею");
      }
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card level={2} className="space-y-4 p-5">
        <Field label="Назва">
          <input
            required
            minLength={4}
            maxLength={140}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Напр. Гра в мафію по п'ятницях"
            className="input"
          />
        </Field>

        <Field label="Короткий опис" hint="Одне речення, яке зачепить">
          <input
            required
            minLength={10}
            maxLength={300}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="input"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Категорія">
            <select value={category} onChange={(e) => setCategory(e.target.value as IdeaCategory)} className="input">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Теги" hint="Через кому">
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="ml, стартап, дизайн"
              className="input"
            />
          </Field>
        </div>

        <Field label="Опис (Markdown)">
          <textarea
            required
            minLength={10}
            maxLength={20000}
            rows={8}
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            placeholder="Розкажіть детальніше про ідею, кого шукаєте, що вже є…"
            className="input resize-y font-mono text-sm"
          />
        </Field>

        <Field label="Кого шукаєте" hint="Необовʼязково, через кому">
          <input
            value={needsRoles}
            onChange={(e) => setNeedsRoles(e.target.value)}
            placeholder="backend, дизайнер, маркетолог"
            className="input"
          />
        </Field>
      </Card>

      {isEvent && (
        <Card level={2} className="space-y-4 p-5">
          <h3 className="font-semibold">Деталі події</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Дата й час">
              <input
                type="datetime-local"
                required
                value={eventAt}
                onChange={(e) => setEventAt(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Місце">
              <input
                value={eventLocation}
                onChange={(e) => setEventLocation(e.target.value)}
                placeholder="НаУКМА, корпус 1"
                className="input"
              />
            </Field>
          </div>
          <Field label="Ліміт учасників" hint="0 = без обмежень">
            <input
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="input"
            />
          </Field>
        </Card>
      )}

      <Card level={1} className="flex flex-wrap items-center justify-between gap-4 p-4">
        {me?.verifiedMohylian ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={ukmaOnly} onChange={(e) => setUkmaOnly(e.target.checked)} />
            Лише для могилянців (не індексується Google)
          </label>
        ) : (
          <p className="text-xs text-[color:var(--ink-3)]">
            Приватні (лише-НаУКМА) ідеї доступні верифікованим могилянцям.
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Публікуємо…" : "Опублікувати ідею"}
        </Button>
      </Card>

      {error && <p className="text-sm text-[color:var(--danger)]">{error}</p>}

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 12px;
          padding: 0.7rem 0.9rem;
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
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-[color:var(--ink-3)]">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
