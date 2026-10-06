import { Button } from "~/components/ui/button";
import { IconSpark } from "./icons";

/**
 * Лічильники покажемо, коли в них буде що рахувати: рядок «0 / 0 / 0» на першому екрані
 * чесно, але нікого не переконує. Значення прийдуть з API; поки всі нулі, блок не рендериться.
 */
const STATS = [
  { value: 0, label: "ідей спільноти" },
  { value: 0, label: "команд формується" },
  { value: 0, label: "подій попереду" },
];

/**
 * Повноекранний кадр як секція Operations на Editions: сфера на весь в'юпорт
 * і один рядок зліва. Метрики рядка (вага 400, line-height 0.96, tracking
 * -0.06em, розмір близько 80px) взяті з їхнього класу .t1 / National2.
 * Сам National 2 не підключаємо: їхній woff2 (fonts-latin) не містить
 * кирилиці, тож «Твори ідеї» малюється Onest.
 */
export function Hero() {
  return (
    <section className="relative h-dvh">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[var(--color-bg)]/70 to-transparent" />
      <div className="relative z-10 flex h-full items-center px-6 sm:px-16 lg:px-[7.5rem]">
        <h1 className="hero-display max-w-[12ch] text-white">Твори ідеї</h1>
      </div>
    </section>
  );
}

/** Текст під вигином сірої сторінки: попередній hero-копірайт лишається на сторінці, просто не в повноекранному кадрі. */
export function HeroIntro() {
  const stats = STATS.filter((stat) => stat.value > 0);
  return (
    <section className="mx-auto max-w-6xl px-5 pt-4 pb-4 sm:px-8">
      <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)]/80 px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]">
        <IconSpark className="size-3.5 text-[var(--color-accent)]" />
        Спільнота Києво-Могилянської академії
      </span>
      <h2 className="mt-5 max-w-xl text-3xl font-medium tracking-tight text-[var(--color-text)] sm:text-4xl">
        Від іскри до команди
      </h2>
      <p className="mt-4 max-w-xl text-lg text-[var(--color-text-muted)]">
        Публікуй стартап, пет-проєкт, дослідження чи подію. Збирай голоси, обговорення й однодумців, щоб
        ідея стала командою.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button to="/ideas/new" arrow>
          Запропонувати ідею
        </Button>
        <Button to="/ideas" variant="secondary">
          Дивитися ідеї
        </Button>
      </div>
      {stats.length > 0 && (
        <div className="mt-10 flex max-w-md gap-10 border-t border-[var(--color-border)] pt-6">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-2xl font-semibold tabular-nums text-[var(--color-text)]">{stat.value}</div>
              <div className="mt-0.5 text-sm text-[var(--color-text-muted)]">{stat.label}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
