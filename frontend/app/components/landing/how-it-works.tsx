import type { ReactNode } from "react";
import { Chip } from "~/components/ui/chip";
import { IconArrowRight } from "./icons";

const GLASS =
  "rounded-xl border border-white/10 bg-[color-mix(in_srgb,var(--color-sheet)_84%,transparent)] shadow-[0_12px_40px_-12px_rgb(0_0_0/0.6)] backdrop-blur-md";

function Line({ className }: { className: string }) {
  return <div className={`h-1.5 rounded-full bg-white/10 ${className}`} />;
}

/** Ілюстрації кроків: умовні, без реальних даних. Для скрінрідерів приховані, зміст у заголовку й тексті. */
function ComposeMock() {
  return (
    <div className={`${GLASS} w-[78%] p-4`}>
      <span className="hud-label">Нова ідея</span>
      <p className="mt-2 text-sm font-medium text-[var(--color-text)]">Клуб настільних ігор</p>
      <div className="mt-2.5 space-y-1.5">
        <Line className="w-full" />
        <Line className="w-3/5" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Chip>Клуб</Chip>
        <span className="rounded-full bg-[var(--color-accent)] px-3 py-1 text-[0.6875rem] font-medium text-[var(--color-bg)]">
          Опублікувати
        </span>
      </div>
    </div>
  );
}

function VoteMock() {
  return (
    <div className="flex w-[78%] flex-col gap-2.5">
      {[
        { count: 12, w: "w-3/5", lead: true },
        { count: 7, w: "w-2/5", lead: false },
      ].map((row) => (
        <div key={row.count} className={`${GLASS} flex items-center gap-3 p-3`}>
          <span
            className={`inline-flex min-w-11 items-center justify-center gap-1 rounded-full border px-2 py-1 text-xs font-medium tabular-nums ${
              row.lead
                ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-white/15 text-[var(--color-text-muted)]"
            }`}
          >
            <IconArrowRight className="size-3 -rotate-90" />
            {row.count}
          </span>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Line className={row.w} />
            <Line className="w-4/5 opacity-60" />
          </div>
        </div>
      ))}
    </div>
  );
}

type Person = { bg: string; skin: string; hair: string; shirt: string; style: "short" | "long" | "cap" };

/** Три умовні різні люди: різні фон, колір шкіри, зачіска й одяг. Без реальних облич і даних. */
const AVATARS: Person[] = [
  { bg: "#3a2f4a", skin: "#e8b894", hair: "#2a1d18", shirt: "#ff6363", style: "short" },
  { bg: "#1f3a3f", skin: "#b9805a", hair: "#15110f", shirt: "#e9e6df", style: "long" },
  { bg: "#3f3a22", skin: "#f2cfb0", hair: "#a8672d", shirt: "#5d7bd6", style: "cap" },
];

function Avatar({ bg, skin, hair, shirt, style }: Person) {
  return (
    <svg
      viewBox="0 0 32 32"
      className="size-8 shrink-0 rounded-full border-2 border-[var(--color-sheet)]"
      aria-hidden="true"
    >
      <rect width="32" height="32" fill={bg} />
      {style === "long" && <path d="M8.5 15a7.5 7.5 0 0 1 15 0v10h-4V16h-7v9h-4z" fill={hair} />}
      <path d="M4 32c0-6 5-9.5 12-9.5S28 26 28 32z" fill={shirt} />
      <rect x="14" y="18" width="4" height="5" rx="1.5" fill={skin} />
      <circle cx="16" cy="14.5" r="5.6" fill={skin} />
      {style === "short" && <path d="M10.4 14.2c-.4-4.4 2.4-6.8 5.8-6.8s6.2 2.2 5.4 6.8c-1-2.4-3.4-3.4-5.4-3.4s-4.4.8-5.8 3.4z" fill={hair} />}
      {style === "long" && <path d="M10.3 14.6c-.5-4.8 2.4-7.4 5.7-7.4s6.2 2.6 5.7 7.4c-1.2-2.8-3.4-3.8-5.7-3.8s-4.5 1-5.7 3.8z" fill={hair} />}
      {style === "cap" && (
        <>
          <path d="M10.2 13.2c0-4 2.6-6.2 5.8-6.2s5.8 2.2 5.8 6.2z" fill={hair} />
          <rect x="9" y="12.6" width="14" height="1.8" rx=".9" fill={hair} />
        </>
      )}
    </svg>
  );
}

function TeamMock() {
  return (
    <div className={`${GLASS} w-[78%] p-4`}>
      <div className="flex -space-x-2">
        {AVATARS.map((person) => (
          <Avatar key={person.bg} {...person} />
        ))}
        <span className="inline-flex size-8 items-center justify-center rounded-full border-2 border-dashed border-white/25 bg-[var(--color-sheet)] text-xs text-[var(--color-text-muted)]">
          +
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip tone="accent">ML</Chip>
        <Chip tone="accent">Design</Chip>
      </div>
      <span className="mt-4 inline-flex rounded-full border border-white/20 px-3 py-1 text-[0.6875rem] font-medium text-[var(--color-text)]">
        Долучитися
      </span>
    </div>
  );
}

const STEPS: { title: string; body: string; mock: ReactNode }[] = [
  {
    title: "Опублікуй",
    body: "Розкажи про ідею за кілька хвилин: стартап, проєкт, дослідження чи подію.",
    mock: <ComposeMock />,
  },
  {
    title: "Збери голоси",
    body: "Спільнота голосує й обговорює. Найкращі ідеї піднімаються у стрічці.",
    mock: <VoteMock />,
  },
  {
    title: "Знайди команду",
    body: "Однодумці долучаються до команди або приходять на твою подію.",
    mock: <TeamMock />,
  },
];

/**
 * Три кроки. Верх кожної колонки — «вікно»: його вирізано зі шторки (`data-sheet-hole`, див. CurvedSheet),
 * тож усередині видно фонову сцену, а поверх неї умовний інтерфейс кроку. Номери `01 02 03` того ж розміру й гарнітури, що й заголовок кроку. Текст статичний: постійний рух того, що читають, лише заважає.
 */
export function HowItWorks() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">Як це працює</h2>
        <span className="hud-label">три кроки</span>
      </div>
      <ol className="mt-8 grid gap-10 sm:grid-cols-3 sm:gap-5">
        {STEPS.map((step, index) => (
          <li key={step.title}>
            <div
              data-sheet-hole
              aria-hidden="true"
              className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-white/10 bg-[rgb(8_9_10/0.4)]"
            >
              {step.mock}
            </div>
            <div className="mt-5 flex items-baseline gap-3">
              <span className="text-base font-medium tabular-nums text-[var(--color-accent)]" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="text-lg font-semibold text-[var(--color-text)]">{step.title}</h3>
            </div>
            <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
