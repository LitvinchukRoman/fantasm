import { IconPenLine, IconPulse, IconUsers } from "./icons";
import { motion, useReducedMotion } from "motion/react";

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

export function HowItWorks() {
  const reduce = useReducedMotion();

  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
          Як це працює
        </h2>
        <span className="text-sm text-[var(--color-text-faint)]">три кроки</span>
      </div>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <motion.li
              key={step.title}
              animate={reduce ? undefined : { y: [0, -8, 0] }}
              transition={{
                duration: 6,
                repeat: Infinity,
                ease: "easeInOut",
                delay: index * 1.5,
              }}
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
            </motion.li>
          );
        })}
      </ol>
    </section>
  );
}
