import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import {
  IconArrowUpRight,
  formatDate,
  hubFilters,
  type ArticleItem,
} from "./shared";

/**
 * Варіант 1 — «Bento».
 * Асиметрична сітка: одна велика стаття + дрібніші. Кожна картка — подвійна
 * рамка (оболонка + серцевина, high-end-visual-design §4A), прожектор, що
 * стежить за курсором, кнопка-острівець зі стрілкою.
 *
 * Зміна розділу, без перемонтування восьми слотів:
 * 1) out — текст гасне, картки стають абстрактними формами; зайві картки
 *    розчиняються на своєму місці;
 * 2) step — картка, якій треба на нове місце, «робить крок»: спершу
 *    витягується до нього (grow), потім підтягує протилежний край (settle);
 * 3) in — нові картки з'являються у звільнених місцях, текст проявляється.
 * Форми лишаються стандартними: головна 2×2, звичайна 1×1, широка 2×1.
 */

const MAX = 8;
const EASE = [0.16, 1, 0.3, 1] as const;
const OUT_MS = 160;
const GROW_MS = 240;
const SETTLE_MS = 240;
const IN_MS = 260;

/** [колонка, ширина, рядок, висота] на сітці з 4 колонок. */
type Area = [number, number, number, number];

const F: Area = [1, 2, 1, 2];
/** Місця карток у порядку читання для кожної кількості статей. */
const LAYOUTS: Record<number, Area[]> = {
  1: [F],
  2: [F, [3, 2, 1, 2]],
  3: [F, [3, 2, 1, 1], [3, 2, 2, 1]],
  4: [F, [3, 1, 1, 1], [4, 1, 1, 1], [3, 2, 2, 1]],
  5: [F, [3, 1, 1, 1], [4, 1, 1, 1], [3, 1, 2, 1], [4, 1, 2, 1]],
  6: [F, [3, 1, 1, 1], [4, 1, 1, 1], [3, 2, 2, 1], [1, 2, 3, 1], [3, 2, 3, 1]],
  7: [F, [3, 1, 1, 1], [4, 1, 1, 1], [3, 1, 2, 1], [4, 1, 2, 1], [1, 2, 3, 1], [3, 2, 3, 1]],
  8: [F, [3, 1, 1, 1], [4, 1, 1, 1], [3, 1, 2, 1], [4, 1, 2, 1], [1, 2, 3, 1], [3, 1, 3, 1], [4, 1, 3, 1]],
};
/** Неактивний слот невидимий і стоїть під головною, щоб не додавати рядків сітці. */
const PARKED: Area = [1, 1, 1, 1];

function rowsOf(count: number) {
  return Math.max(...LAYOUTS[count].map(([, , r, rs]) => r + rs - 1));
}

/** Проміжна форма кроку: прямокутник, що накриває і старе, і нове місце. */
function union(a: Area, b: Area): Area {
  const c = Math.min(a[0], b[0]);
  const r = Math.min(a[2], b[2]);
  const c2 = Math.max(a[0] + a[1], b[0] + b[1]);
  const r2 = Math.max(a[2] + a[3], b[2] + b[3]);
  return [c, c2 - c, r, r2 - r];
}

type Phase = "idle" | "out" | "grow" | "settle" | "in";

const SHELL_RING = "0 0 0 1px rgb(255 255 255 / 0.08)";
const CORE_INSET = "inset 0 1px 0 rgb(255 255 255 / 0.07)";

function spotlight(event: React.MouseEvent<HTMLElement>) {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
}

function Rings() {
  return (
    <svg
      viewBox="0 0 240 240"
      aria-hidden="true"
      className="bento-rings pointer-events-none absolute -right-16 -bottom-16 size-72 text-white/[0.07]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      <circle cx="120" cy="120" r="30" />
      <circle cx="120" cy="120" r="60" />
      <circle cx="120" cy="120" r="90" />
      <circle cx="120" cy="120" r="118" />
      <path d="M120 2v236M2 120h236" strokeDasharray="2 6" />
      <circle cx="120" cy="30" r="5" className="text-[var(--color-accent)]" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconClock({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden="true">
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 4.75V8l2.25 1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Абстрактна форма картки: ті самі блоки, що й текст, але без змісту. */
function Skeleton({ show, featured, animate }: { show: boolean; featured: boolean; animate: boolean }) {
  const bar = "rounded-full";
  return (
    <motion.div
      layout={animate}
      aria-hidden="true"
      initial={false}
      animate={{ opacity: show ? 1 : 0 }}
      transition={{ duration: 0.2, ease: EASE }}
      className={
        "pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-6 " + (featured ? "md:p-8" : "")
      }
    >
      <div className="flex items-center gap-2.5">
        <motion.div layout={animate} className={`${bar} h-7 w-24 bg-white/[0.06]`} />
        <motion.div layout={animate} className={`${bar} h-2.5 w-10 bg-white/[0.04]`} />
      </div>
      <div>
        <motion.div layout={animate} className={`${bar} ${featured ? "h-7 w-4/5" : "h-4 w-3/4"} bg-white/[0.07]`} />
        <motion.div layout={animate} className={`${bar} mt-3 ${featured ? "h-7 w-3/5" : "h-4 w-1/2"} bg-white/[0.07]`} />
        <motion.div layout={animate} className={`${bar} mt-5 h-2.5 w-5/6 bg-white/[0.04]`} />
        <motion.div layout={animate} className={`${bar} mt-2 h-2.5 w-2/3 bg-white/[0.04]`} />
        <div className="mt-6 flex items-center justify-between">
          <motion.div layout={animate} className={`${bar} h-2.5 w-16 bg-white/[0.04]`} />
          <motion.div layout={animate} className="size-9 rounded-full bg-white/[0.06]" />
        </div>
      </div>
    </motion.div>
  );
}

function CardContent({ article, featured }: { article: ArticleItem; featured: boolean }) {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2.5 whitespace-nowrap">
        <span className="truncate rounded-full bg-white/[0.06] px-3 py-1 text-xs leading-5 font-medium text-[var(--color-text)] ring-1 ring-white/[0.06]">
          {article.hubLabel}
        </span>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs leading-5 tabular-nums text-[var(--color-text-muted)]">
          <IconClock className="size-3.5 text-[var(--color-text-faint)]" />
          {article.minutes} хв
        </span>
      </div>

      <div className="mt-10 md:mt-0">
        <h3
          className={
            "text-balance font-medium text-[var(--color-text)] " +
            // Рядки фіксованої висоти: довга назва не має виштовхувати дату й стрілку з картки.
            (featured
              ? "line-clamp-4 max-w-[18ch] text-3xl leading-[1.08] tracking-[-0.03em] sm:text-[2.5rem]"
              : "line-clamp-3 text-lg leading-snug tracking-[-0.02em] sm:text-xl")
          }
        >
          {article.title}
        </h3>
        <p
          className={
            "mt-3 text-[var(--color-text-muted)] " +
            (featured ? "line-clamp-3 max-w-[46ch] text-base" : "line-clamp-2 text-sm")
          }
        >
          {article.description}
        </p>
        <div className="mt-6 flex items-center justify-between gap-4">
          <time dateTime={article.date} className="text-[13px] tabular-nums text-[var(--color-text-faint)]">
            {formatDate(article.date)}
          </time>
          <span className="grid size-9 place-items-center rounded-full bg-white/[0.06] text-[var(--color-text)] transition-[background-color,color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:bg-[var(--color-accent)] group-hover:text-[#0a0a0a]">
            <IconArrowUpRight className="size-4" />
          </span>
        </div>
      </div>
    </>
  );
}

function filterItems(articles: ArticleItem[], hub: string) {
  return (hub === "all" ? articles : articles.filter((a) => a.hub === hub)).slice(0, MAX);
}

export function ArticlesBento({
  articles,
  headingAs: Heading = "h2",
  showAllLink = true,
}: {
  articles: ArticleItem[];
  /** h1, коли секція — головний заголовок сторінки (/guides). */
  headingAs?: "h1" | "h2";
  /** «Усі гайди» веде на /guides, тож на самій /guides кнопка зайва. */
  showAllLink?: boolean;
}) {
  const reduce = useReducedMotion() ?? false;
  const animate = !reduce;
  const filters = useMemo(() => hubFilters(articles), [articles]);

  // selected — пігулка (реагує одразу); applied — розділ, чий текст у картках
  // (міняється, коли текст уже згас); from/to — кількості до й після переходу.
  const [selected, setSelected] = useState("all");
  const [applied, setApplied] = useState("all");
  const initialCount = Math.max(1, filterItems(articles, "all").length);
  const [from, setFrom] = useState(initialCount);
  const [to, setTo] = useState(initialCount);
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);

  function select(slug: string) {
    if (slug === selected) return;
    const nextCount = Math.max(1, filterItems(articles, slug).length);
    setSelected(slug);
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
    if (reduce) {
      setApplied(slug);
      setFrom(nextCount);
      setTo(nextCount);
      setPhase("idle");
      return;
    }
    // Перехід, перерваний новим кліком, стартує з того макета, куди вже йшов.
    setFrom(to);
    setTo(nextCount);
    setPhase("out");
    let t = 0;
    const at = (ms: number, fn: () => void) => {
      t += ms;
      timers.current.push(window.setTimeout(fn, t));
    };
    at(OUT_MS, () => {
      setApplied(slug);
      setPhase("grow");
    });
    at(GROW_MS, () => setPhase("settle"));
    at(SETTLE_MS, () => setPhase("in"));
    at(IN_MS, () => {
      setFrom(nextCount);
      setPhase("idle");
    });
  }

  const items = useMemo(() => filterItems(articles, applied), [articles, applied]);
  const textHidden = phase === "out" || phase === "grow" || phase === "settle";
  const rows = phase === "grow" ? Math.max(rowsOf(from), rowsOf(to)) : phase === "idle" || phase === "out" ? rowsOf(from) : rowsOf(to);

  function slotState(slot: number): { area: Area; visible: boolean; active: boolean } {
    const was = slot < from;
    const will = slot < to;
    switch (phase) {
      case "idle":
      case "out":
        return { area: was ? LAYOUTS[from][slot] : PARKED, visible: was && (phase === "idle" || will), active: was };
      case "grow":
        if (was && will) return { area: union(LAYOUTS[from][slot], LAYOUTS[to][slot]), visible: true, active: true };
        return { area: will ? LAYOUTS[to][slot] : PARKED, visible: false, active: false };
      case "settle":
        return { area: will ? LAYOUTS[to][slot] : PARKED, visible: was && will, active: was && will };
      case "in":
        return { area: will ? LAYOUTS[to][slot] : PARKED, visible: will, active: will };
    }
  }

  const stepTransition = { duration: GROW_MS / 1000, ease: EASE };

  return (
    <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32" aria-labelledby="bento-title">
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-xl">
          <Heading
            id="bento-title"
            className="text-balance text-4xl font-medium leading-[1.02] tracking-[-0.03em] text-[var(--color-text)] sm:text-6xl"
          >
            Гайди, які варто прочитати до дедлайну
          </Heading>
          <p className="mt-4 max-w-[48ch] text-lg text-[var(--color-text-muted)]">
            Стартап, вечір мафії чи стипендія: короткі покрокові матеріали від людей, які це вже
            пройшли.
          </p>
        </div>

        <LayoutGroup id="bento-filters">
          <div role="group" aria-label="Розділ" className="flex flex-wrap gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/[0.08]">
            {[{ slug: "all", label: "Усі" }, ...filters].map((item) => {
              const active = selected === item.slug;
              return (
                <button
                  key={item.slug}
                  type="button"
                  aria-pressed={active}
                  onClick={() => select(item.slug)}
                  className={
                    "relative rounded-full px-4 py-2 text-sm font-medium transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] " +
                    (active
                      ? "text-[#0a0a0a]"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]")
                  }
                >
                  {active ? (
                    <motion.span
                      layoutId="bento-pill"
                      className="absolute inset-0 rounded-full bg-[var(--color-text)]"
                      transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}
                    />
                  ) : null}
                  <span className="relative">{item.label}</span>
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      <motion.div
        layout={animate}
        transition={{ layout: stepTransition }}
        style={{ "--rows": rows } as React.CSSProperties}
        className="mt-12 grid gap-4 md:grid-cols-4 md:[grid-template-rows:repeat(var(--rows),300px)]"
      >
        {Array.from({ length: MAX }, (_, slot) => {
          const { area, visible, active } = slotState(slot);
          const article = slot < items.length ? items[slot] : undefined;
          const featured = slot === 0;
          const [c, cs, r, rs] = area;
          return (
            <motion.div
              key={slot}
              layout={animate}
              initial={false}
              animate={{ opacity: visible ? 1 : 0 }}
              transition={{ layout: stepTransition, opacity: { duration: 0.2, ease: EASE } }}
              onMouseMove={spotlight}
              aria-hidden={!active}
              style={
                {
                  borderRadius: 20,
                  boxShadow: SHELL_RING,
                  zIndex: visible ? 1 : 0,
                  "--gc": `${c} / span ${cs}`,
                  "--gr": `${r} / span ${rs}`,
                } as React.CSSProperties
              }
              className={
                "bento-shell group relative bg-white/[0.03] p-1.5 transition-[background-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/[0.05] md:[grid-column:var(--gc)] md:[grid-row:var(--gr)] " +
                (active ? "" : "pointer-events-none max-md:hidden")
              }
            >
              <motion.div
                layout={animate}
                transition={{ layout: stepTransition }}
                style={{ borderRadius: 14, boxShadow: CORE_INSET }}
                className={
                  "bento-core relative h-full overflow-hidden bg-[var(--color-surface)] md:min-h-0 " +
                  (featured ? "min-h-[340px]" : "min-h-[220px]")
                }
              >
                {featured ? <Rings /> : null}
                <Skeleton show={textHidden} featured={featured} animate={animate} />
                <motion.div
                  initial={false}
                  animate={{ opacity: textHidden ? 0 : 1, y: textHidden ? 4 : 0 }}
                  transition={{
                    duration: (textHidden ? OUT_MS : IN_MS) / 1000,
                    ease: EASE,
                    delay: textHidden || reduce ? 0 : slot * 0.02,
                  }}
                  className={
                    "relative flex h-full flex-col justify-between p-5 sm:p-6 " + (featured ? "md:p-8" : "")
                  }
                >
                  {article ? <CardContent article={article} featured={featured} /> : null}
                </motion.div>
                {article ? (
                  <Link
                    to={article.path}
                    prefetch="intent"
                    aria-label={article.title}
                    tabIndex={active ? undefined : -1}
                    className="absolute inset-0 z-10 rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-accent)]"
                  />
                ) : null}
              </motion.div>
            </motion.div>
          );
        })}
      </motion.div>

      {showAllLink ? (
        <motion.div layout={animate ? "position" : false} transition={{ layout: stepTransition }} className="mt-10 flex justify-center">
          <Link
            to="/guides"
            prefetch="intent"
            className="group inline-flex items-center gap-3 rounded-full bg-[var(--color-text)] py-2 pr-2 pl-6 text-sm font-medium text-[#0a0a0a] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            Усі гайди
            <span className="grid size-8 place-items-center rounded-full bg-black/10 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105">
              <IconArrowUpRight className="size-4" />
            </span>
          </Link>
        </motion.div>
      ) : null}
    </section>
  );
}
