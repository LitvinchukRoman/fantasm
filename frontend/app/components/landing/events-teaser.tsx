import { Link } from "react-router";
import { Chip } from "~/components/ui/chip";
import { eventWhen, type IdeaCard } from "~/lib/ideas";
import { EmptyState } from "./empty-state";
import { IconArrowRight, IconCalendar, IconUsers } from "./icons";

/**
 * "Найближчі події" на лендингу. Є події: до трьох найближчих карток.
 * Немає: порожній стан із закликом створити першу. Текст порожнього стану з MVP,
 * em-dash замінено на двокрапку/кому.
 */
export function EventsTeaser({ events }: { events: IdeaCard[] }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
          Найближчі події
        </h2>
        <Link
          to="/events"
          prefetch="intent"
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] hover:underline transition-transform hover:scale-105"
        >
          Усі події
          <IconArrowRight className="size-4" />
        </Link>
      </div>

      <div className="mt-8">
        {events.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((event) => (
              <li key={event.slug}>
                <Link
                  to={`/ideas/${event.slug}`}
                  prefetch="intent"
                  className="group flex h-full flex-col rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-strong)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone="accent">{eventWhen(event.eventAt!)}</Chip>
                    {event.eventLocation && (
                      <span className="min-w-0 truncate text-sm text-[var(--color-text-muted)]">{event.eventLocation}</span>
                    )}
                  </div>
                  <h3 className="mt-3 font-semibold leading-snug text-[var(--color-text)] wrap-anywhere group-hover:text-[var(--color-accent)]">
                    {event.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-sm text-[var(--color-text-muted)]">{event.summary}</p>
                  <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-sm">
                    <span className="inline-flex items-center gap-1 font-medium text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)]">
                      Деталі <IconArrowRight className="size-3.5" />
                    </span>
                    {event.participants > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs tabular-nums text-[var(--color-text-faint)]">
                        <IconUsers className="size-3.5" /> {event.participants}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={IconCalendar}
            title="Подій поки немає"
            body="Створіть подію: гру, лекцію чи зустріч, і зберіть учасників."
            actionHref="/ideas/new"
            actionLabel="Створити подію"
          />
        )}
      </div>
    </section>
  );
}
