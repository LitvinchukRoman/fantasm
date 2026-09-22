import { PenLine, ArrowUpCircle, Users } from "lucide-react";

const STEPS = [
  {
    icon: PenLine,
    title: "Опублікуй",
    body: "Розкажи про ідею за кілька хвилин — стартап, проєкт, дослідження чи подію.",
  },
  {
    icon: ArrowUpCircle,
    title: "Збери голоси",
    body: "Спільнота голосує й обговорює. Найкращі ідеї піднімаються у стрічці.",
  },
  {
    icon: Users,
    title: "Знайди команду",
    body: "Однодумці долучаються до команди або приходять на твою подію.",
  },
];

/** Horizontal scroll-snap on mobile, 3-up on desktop. */
export function HowItWorks() {
  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-h2">Як це працює</h2>
        <span className="text-caption">три кроки</span>
      </div>
      <ol className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:overflow-visible">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <li
              key={s.title}
              className="card min-w-[78%] snap-center p-6 sm:min-w-0"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--accent)_16%,transparent)] text-[color:var(--accent-ink)]">
                  <Icon className="size-5" />
                </span>
                <span className="text-caption tabnums">0{i + 1}</span>
              </div>
              <h3 className="text-h3 mt-4">{s.title}</h3>
              <p className="mt-1.5 text-[color:var(--ink-2)]">{s.body}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
