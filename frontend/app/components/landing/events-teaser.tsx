import { EmptyState } from "./empty-state";
import { IconArrowRight, IconCalendar } from "./icons";

/**
 * "Найближчі події" — так само з legacy/app/page.tsx, випала при першому
 * проході. Текст порожнього стану — з EmptyState для getEvents() без
 * даних (legacy), не вигадка; em-dash у оригіналі ("подію — гру,
 * лекцію чи зустріч — і зберіть") замінено на двокрапку/кому — заборона
 * em-dash у видимому тексті, слова не змінені.
 */
export function EventsTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
          Найближчі події
        </h2>
        <a
          href="/events"
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] hover:underline transition-transform hover:scale-105"
        >
          Усі події
          <IconArrowRight className="size-4" />
        </a>
      </div>

      <div className="mt-8">
        <EmptyState
          icon={IconCalendar}
          title="Подій поки немає"
          body="Створіть подію: гру, лекцію чи зустріч, і зберіть учасників."
          actionHref="/ideas/new"
          actionLabel="Створити подію"
        />
      </div>
    </section>
  );
}
