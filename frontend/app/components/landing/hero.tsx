import { IconArrowRight, IconSpark } from "./icons";

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
 * кирилиці, тож «Твори ідеї» малюється Inter, який вже є тілесним шрифтом
 * raycast і ShopifyInter.
 */
export function Hero() {
  return (
    <section className="relative h-dvh">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-[#08090a]/70 to-transparent" />
      <div className="relative z-10 flex h-full items-center px-6 sm:px-16 lg:px-[7.5rem]">
        <h1 className="hero-display max-w-[12ch] text-white">Твори ідеї</h1>
      </div>
    </section>
  );
}

/** Текст під вигином сірої сторінки: попередній hero-копірайт лишається на сторінці, просто не в повноекранному кадрі. */
export function HeroIntro() {
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
        Публікуй стартап, пет-проєкт, дослідження чи подію. Збирай голоси,
        обговорення й однодумців. Могилянці отримують печатку та переваги
        кампусу.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a
          href="/ideas/new"
          className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-bg)] transition-transform duration-150 hover:bg-[var(--color-accent-strong)] active:scale-[0.98]"
        >
          Запропонувати ідею
          <IconArrowRight className="size-4" />
        </a>
        <a
          href="/ideas"
          className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors duration-150 hover:bg-[var(--color-surface-strong)]"
        >
          Дивитися ідеї
        </a>
      </div>
      <div className="mt-10 flex max-w-md gap-10 border-t border-[var(--color-border)] pt-6">
        {STATS.map((stat) => (
          <div key={stat.label}>
            <div className="text-2xl font-semibold tabular-nums text-[var(--color-text)]">{stat.value}</div>
            <div className="mt-0.5 text-sm text-[var(--color-text-muted)]">{stat.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
