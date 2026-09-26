import {
  IconBook,
  IconCalendar,
  IconDots,
  IconHeart,
  IconLayers,
  IconSpark,
} from "./icons";

const KINDS = [
  { icon: IconSpark, label: "Стартап" },
  { icon: IconLayers, label: "Проєкт" },
  { icon: IconCalendar, label: "Подія" },
  { icon: IconBook, label: "Книжковий клуб" },
  { icon: IconHeart, label: "Волонтерство" },
  { icon: IconDots, label: "Інше" },
];

/**
 * Шість пунктів — більше за ліміт "5 елементів" для звичайного списку
 * (frontend-design skill, Content Density), тому замість <ul> з
 * маркерами — горизонтальний ряд піл-чіпів, що переносяться на новий
 * рядок на десктопі й скролиться на мобільному.
 */
export function IdeaKinds() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
        Ідея може мати будь-яку форму
      </h2>
      <p className="mt-3 max-w-md text-[var(--color-text-muted)]">
        Стрічка не лише для стартапів. Це місце і для одноразової події, і
        для клубу, який зустрічається щотижня.
      </p>

      <ul className="mt-8 flex flex-wrap gap-3">
        {KINDS.map((kind) => {
          const Icon = kind.icon;
          return (
            <li
              key={kind.label}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-text)]"
            >
              <Icon className="size-4 text-[var(--color-text-muted)]" />
              {kind.label}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
