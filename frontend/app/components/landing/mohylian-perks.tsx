import { ChecklistX } from "./checklist-x";
import { IconSpark } from "./icons";

/**
 * Копірайт без поділу на «першого» і «другого» сорту: усе доступне кожному,
 * печатка могилянця подана як знак довіри, а не як пропуск. Лише позитивні формулювання,
 * без «недоступно / менше впливу».
 */
const STEPS = [
  {
    title: "Вхід за хвилину",
    caption: "Google або Microsoft-акаунт, без анкет і окремого пароля.",
  },
  {
    title: "Твою ідею побачить уся спільнота",
    caption: "Її можна підтримати голосом, обговорити в коментарях і запропонувати допомогу.",
  },
  {
    title: "Люди, готові долучитися",
    caption: "Студенти, випускники та друзі кампусу, які шукають команду чи подію для себе.",
  },
  {
    title: "Печатка могилянця як знак довіри",
    caption: "Увійди з поштою ukma.edu.ua, і профіль отримає знак, що ти зі спільноти Могилянки.",
  },
];

export function MohylianPerks() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)]/80 px-3 py-1 text-xs font-medium text-[var(--color-text-muted)]">
            <IconSpark className="size-3.5 text-[var(--color-accent)]" />
            Для всієї спільноти
          </span>
          <h2 className="mt-3 max-w-md text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Місце, де студентські ідеї знаходять команду
          </h2>
          <p className="mt-3 max-w-md text-[var(--color-text-muted)]">
            Fantasm — платформа для стартапів, досліджень, подій і клубів Києво-Могилянської академії.
            Приєднуйся з Google чи Microsoft-акаунтом, публікуй ідею й збирай однодумців. Могилянці
            додатково підтверджують профіль печаткою.
          </p>
        </div>

        <ChecklistX items={STEPS} className="lg:mt-1" />
      </div>
    </section>
  );
}
