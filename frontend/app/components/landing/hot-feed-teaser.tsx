import { EmptyState } from "./empty-state";
import { IconArrowRight, IconFlame, IconPenLine } from "./icons";

/**
 * "Гарячі зараз" — секція зі стрічки була в лендингу legacy
 * (legacy/app/page.tsx) і випала при першому проході редизайну. Заголовок
 * і посилання "Усі ідеї" — звідти ж; текст порожнього стану — з
 * EmptyState, який legacy рендерить, коли getFeed повертає 0 елементів
 * (саме так, без даних), а не вигадана заглушка.
 */
export function HotFeedTeaser() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="flex items-end justify-between gap-4">
        <h2 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
          <IconFlame className="size-6 text-[var(--color-accent)]" />
          Гарячі зараз
        </h2>
        <a
          href="/ideas"
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] hover:underline transition-transform hover:scale-105"
        >
          Усі ідеї
          <IconArrowRight className="size-4" />
        </a>
      </div>

      <div className="mt-8">
        <EmptyState
          icon={IconPenLine}
          title="Тут з'явиться перша ідея"
          body="Станьте першим, хто поділиться ідеєю зі спільнотою."
          actionHref="/ideas/new"
          actionLabel="Запропонувати ідею"
        />
      </div>
    </section>
  );
}
