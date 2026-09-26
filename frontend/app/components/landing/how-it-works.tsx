import { IconPenLine, IconPulse, IconUsers } from "./icons";

const STEPS = [
  {
    icon: IconPenLine,
    title: "Опублікуй",
    body: "Розкажи про ідею за кілька хвилин: стартап, проєкт, дослідження чи подію.",
  },
  {
    icon: IconPulse,
    title: "Збери голоси",
    body: "Спільнота голосує й обговорює. Найкращі ідеї піднімаються у стрічці.",
  },
  {
    icon: IconUsers,
    title: "Знайди команду",
    body: "Однодумці долучаються до команди або приходять на твою подію.",
  },
];

/**
 * Реальна послідовність дій, тому нумерація тут доречна за змістом
 * (frontend-design skill: "numbered markers only if content really is a
 * sequence") — але без цифр-лейблів "01/02/03", які є типовим AI-тлом;
 * порядок передає сама верстка row/grid. Текст кроків — з
 * legacy/components/home/how-it-works.tsx, підпис "три кроки" звідти ж.
 */
export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
          Як це працює
        </h2>
        <span className="text-sm text-[var(--color-text-faint)]">три кроки</span>
      </div>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <li
              key={step.title}
              className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            >
              <span className="inline-flex size-10 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-[var(--color-text)]">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
                {step.body}
              </p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
