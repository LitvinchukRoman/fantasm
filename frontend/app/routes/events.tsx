import { useState } from "react";
import { Link, useSearchParams, type ShouldRevalidateFunctionArgs } from "react-router";
import { EventsCalendar, formatDay, nextRange, type DayRange } from "~/components/events/calendar";
import { GuideFrame } from "~/components/guides/frame";
import { EmptyState } from "~/components/landing/empty-state";
import { IconArrowRight, IconCalendar, IconUsers } from "~/components/landing/icons";
import { NAUKMA, eventTime, kyivDayKey, type IdeaCard } from "~/lib/ideas";
import { getIdeas, toCard } from "~/lib/ideas.server";
import { noindexSeo, seo } from "~/lib/seo";
import { breadcrumbList, collectionPage, itemList } from "~/lib/structured-data";
import { useHydrated } from "~/lib/use-hydrated";
import type { Route } from "./+types/events";

const TITLE = "Найближчі події, Fantasm";
const DESCRIPTION = "Події спільноти НаУКМА: ігри, лекції, зустрічі та воркшопи. Обери день у календарі й приходь.";

export function loader() {
  const events = getIdeas()
    .filter((idea) => idea.category === "EVENT" && idea.eventAt)
    .map(toCard)
    .sort((a, b) => Date.parse(a.eventAt!) - Date.parse(b.eventAt!));
  return { events };
}

/** Вибір дня живе в query-рядку й застосовується на клієнті: лоадер від нього не залежить. */
export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (currentUrl.pathname === nextUrl.pathname) return false;
  return defaultShouldRevalidate;
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const indexable = data.events.filter((event) => !event.fixture);
  // Порожній список це тонка сторінка: у індекс вона піде, коли з'явиться перша справжня подія.
  if (indexable.length === 0) return noindexSeo({ title: TITLE, description: DESCRIPTION, path: "/events" });
  return seo({
    title: TITLE,
    description: DESCRIPTION,
    // Вибраний проміжок (?from=…&to=…) це та сама сторінка: canonical завжди без query.
    path: "/events",
    jsonLd: [
      collectionPage({ name: TITLE, description: DESCRIPTION, path: "/events" }),
      breadcrumbList([
        { name: "Головна", path: "/" },
        { name: "Події", path: "/events" },
      ]),
      itemList(indexable.map((event) => ({ name: event.title, path: `/ideas/${event.slug}` }))),
    ],
  });
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

function readRange(params: URLSearchParams): DayRange | null {
  const from = params.get("from");
  const to = params.get("to") ?? from;
  if (!from || !to || !DAY_KEY.test(from) || !DAY_KEY.test(to)) return null;
  return from <= to ? { from, to } : { from: to, to: from };
}

function writeRange(range: DayRange | null): URLSearchParams {
  const params = new URLSearchParams();
  if (range) {
    params.set("from", range.from);
    if (range.to !== range.from) params.set("to", range.to);
  }
  return params;
}

const weekdayDay = new Intl.DateTimeFormat("uk-UA", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function groupHeading(key: string): string {
  const [year, month, day] = key.split("-").map(Number);
  return weekdayDay.format(new Date(Date.UTC(year, month - 1, day)));
}

function IconPin({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M10 17.5s5.5-4.6 5.5-9a5.5 5.5 0 1 0-11 0c0 4.4 5.5 9 5.5 9Z" />
      <circle cx="10" cy="8.5" r="2" />
    </svg>
  );
}

function EventItem({ event, past }: { event: IdeaCard; past: boolean }) {
  return (
    <Link
      to={`/ideas/${event.slug}`}
      prefetch="intent"
      className={
        "group block rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-strong)] " +
        (past ? "opacity-60" : "")
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-0.5 font-medium tabular-nums text-[var(--color-accent)]">
          {eventTime(event.eventAt!)}
        </span>
        {event.campus?.id === NAUKMA.id && (
          <span className="rounded-full border border-[var(--color-border-strong)] px-2.5 py-0.5 text-[var(--color-text-muted)]">
            {NAUKMA.label}
          </span>
        )}
        {past && <span className="text-[var(--color-text-faint)]">Минула</span>}
      </div>
      <h3 className="mt-2 font-semibold leading-snug text-[var(--color-text)] wrap-anywhere group-hover:text-[var(--color-accent)]">
        {event.title}
      </h3>
      {event.eventLocation && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
          <IconPin className="size-3.5 shrink-0" />
          <span className="wrap-anywhere">{event.eventLocation}</span>
        </p>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 text-sm">
        <span className="inline-flex items-center gap-1 font-medium text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)]">
          Деталі <IconArrowRight className="size-3.5" />
        </span>
        {event.participants > 0 && (
          <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-faint)] tabular-nums">
            <IconUsers className="size-3.5" /> {event.participants}
          </span>
        )}
      </div>
    </Link>
  );
}

export default function EventsPage({ loaderData }: Route.ComponentProps) {
  const { events } = loaderData;
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMonth, setViewMonth] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  // Пререндер зібраний без query і без «сьогодні»: до гідрації показуємо всі події
  // як є, а вибраний проміжок і минулі події застосовуємо одразу після неї.
  const hydrated = useHydrated();
  const range = hydrated ? readRange(searchParams) : null;
  const today = hydrated ? kyivDayKey(now) : null;

  const counts: Record<string, number> = {};
  for (const event of events) {
    const key = kyivDayKey(event.eventAt!);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  const month = viewMonth ?? (range ? range.from.slice(0, 7) : events.length > 0 ? kyivDayKey(events[0].eventAt!).slice(0, 7) : "2026-10");

  function setRange(next: DayRange | null) {
    setSearchParams(writeRange(next), { replace: true, preventScrollReset: true });
  }

  const visible = range
    ? events.filter((event) => {
        const key = kyivDayKey(event.eventAt!);
        return key >= range.from && key <= range.to;
      })
    : events;

  const groups: { key: string; items: IdeaCard[] }[] = [];
  for (const event of visible) {
    const key = kyivDayKey(event.eventAt!);
    const last = groups.at(-1);
    if (last?.key === key) last.items.push(event);
    else groups.push({ key, items: [event] });
  }

  return (
    <GuideFrame>
      <div className="mx-auto max-w-5xl">
        <header>
          <h1 className="text-3xl font-semibold text-[var(--color-text)]">Найближчі події</h1>
          <p className="mt-2 text-[var(--color-text-muted)]">Приєднуйтесь офлайн і онлайн: від ігор до лекцій.</p>
        </header>

        {events.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              icon={IconCalendar}
              title="Подій поки немає"
              body="Створіть подію: гру, лекцію чи зустріч, і зберіть учасників."
              actionHref="/ideas/new"
              actionLabel="Створити подію"
            />
          </div>
        ) : (
          <div className="mt-8 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="lg:order-1 max-lg:order-2">
              {groups.length === 0 ? (
                <p className="text-sm text-[var(--color-text-muted)]" role="status">
                  На {range!.from === range!.to ? formatDay(range!.from) : "ці дні"} подій немає. Оберіть інший день або скиньте вибір.
                </p>
              ) : (
                <ol className="relative ml-1.5 border-l border-[var(--color-border-strong)]">
                  {groups.map((group) => (
                    <li key={group.key} className="relative pb-8 pl-6 last:pb-0">
                      <span
                        aria-hidden="true"
                        className="absolute top-[7px] -left-[5px] size-2.5 rounded-full border-2 border-[var(--color-bg)] bg-[var(--color-accent)]"
                      />
                      <h2 className="text-sm font-medium text-[var(--color-text-muted)] first-letter:uppercase">
                        {groupHeading(group.key)}
                      </h2>
                      <ul className="mt-3 space-y-3">
                        {group.items.map((event) => (
                          <li key={event.slug}>
                            <EventItem event={event} past={today !== null && group.key < today} />
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <aside className="lg:order-2 max-lg:order-1 lg:sticky lg:top-24">
              <EventsCalendar
                month={month}
                counts={counts}
                range={range}
                today={today}
                onMonthChange={setViewMonth}
                onPick={(key) => setRange(nextRange(range, key))}
                onClear={() => setRange(null)}
              />
            </aside>
          </div>
        )}
      </div>
    </GuideFrame>
  );
}
