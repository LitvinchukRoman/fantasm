import {
  IconBook,
  IconCalendar,
  IconDots,
  IconHeart,
  IconLayers,
  IconSpark,
  IconFlame,
  IconFlask,
  IconNewspaper,
  IconUsers,
} from "./icons";

const KINDS = [
  { icon: IconSpark, label: "Стартап" },
  { icon: IconLayers, label: "Проєкт" },
  { icon: IconCalendar, label: "Подія" },
  { icon: IconBook, label: "Книжковий клуб" },
  { icon: IconHeart, label: "Волонтерство" },
  { icon: IconUsers, label: "Студентська організація" },
  { icon: IconFlame, label: "Хакатон" },
  { icon: IconFlask, label: "Дослідження" },
  { icon: IconNewspaper, label: "Медіа/Журналістика" },
  { icon: IconDots, label: "Інше" },
];

export function IdeaKinds() {
  const content = (
    <ul className="flex shrink-0 items-center gap-3 pr-3">
      {KINDS.map((kind) => {
        const Icon = kind.icon;
        return (
          <li
            key={kind.label}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:border-[var(--color-border-strong)] hover:bg-[var(--color-surface-strong)]"
          >
            <Icon className="size-4 text-[var(--color-text-muted)]" />
            {kind.label}
          </li>
        );
      })}
    </ul>
  );

  return (
    <section className="mx-auto max-w-6xl px-5 py-20 overflow-hidden sm:px-8 sm:py-24">
      <div className="flex flex-col items-center text-center">
        <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
          Ідея може мати будь-яку форму
        </h2>
        <p className="mt-3 max-w-md text-[var(--color-text-muted)]">
          Стрічка не лише для стартапів. Це місце і для одноразової події, і
          для клубу, який зустрічається щотижня.
        </p>
      </div>

      <div className="relative mt-12 flex w-full overflow-hidden py-1 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="animate-marquee flex w-max items-center">
          {content}
          {content}
        </div>
      </div>
    </section>
  );
}
