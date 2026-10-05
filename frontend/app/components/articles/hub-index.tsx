import { Link } from "react-router";
import { IconArrowUpRight } from "./shared";

export interface HubIndexEntry {
  hub: string;
  title: string;
  description: string;
  articles: { title: string; path: string; minutes: number }[];
}

const EASE_CLASS = "ease-[cubic-bezier(0.16,1,0.3,1)]";

/** 1 матеріал, 3 матеріали, 5 матеріалів. */
function plural(n: number, [one, few, many]: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${n} ${word}`;
}
const HUB_WORDS: [string, string, string] = ["розділ", "розділи", "розділів"];
const ITEM_WORDS: [string, string, string] = ["матеріал", "матеріали", "матеріалів"];

/**
 * Повний перелік гайдів під Bento. Та сама мова, що й картки: подвійна рамка,
 * hairline-межі, акцент лише на наведенні. Кожен розділ — рядок: ліворуч
 * опис розділу, праворуч нумерований зміст.
 */
export function HubIndex({ hubs }: { hubs: HubIndexEntry[] }) {
  const total = hubs.reduce((sum, hub) => sum + hub.articles.length, 0);

  return (
    <section aria-labelledby="hub-index-title" className="mx-auto max-w-6xl px-5 pb-24 sm:px-8 sm:pb-32">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <h2
          id="hub-index-title"
          className="text-balance text-3xl font-medium leading-[1.05] tracking-[-0.03em] text-[var(--color-text)] sm:text-4xl"
        >
          Усі розділи
        </h2>
        <p className="text-sm tabular-nums text-[var(--color-text-muted)]">
          {plural(hubs.length, HUB_WORDS)} · {plural(total, ITEM_WORDS)}
        </p>
      </div>

      <div className="mt-10 grid gap-4">
        {hubs.map((hub) => {
          const minutes = hub.articles.reduce((sum, article) => sum + article.minutes, 0);
          return (
            <section
              key={hub.hub}
              aria-labelledby={`hub-${hub.hub}`}
              className="rounded-[20px] bg-white/[0.03] p-1.5 ring-1 ring-white/[0.08]"
            >
              <div className="overflow-hidden rounded-[14px] bg-[var(--color-surface)] shadow-[inset_0_1px_0_rgb(255_255_255/0.07)]">
                {/* Шапка на всю ширину: висота не залежить від кількості статей у розділі. */}
                <div className="flex flex-col gap-6 border-b border-white/[0.06] p-6 sm:p-8 md:flex-row md:items-end md:justify-between">
                  <div className="max-w-2xl">
                    <h3
                      id={`hub-${hub.hub}`}
                      className="text-balance text-2xl font-medium leading-[1.1] tracking-[-0.02em] text-[var(--color-text)]"
                    >
                      {hub.title}
                    </h3>
                    <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--color-text-muted)]">
                      {hub.description}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-5 md:justify-end">
                    <span className="text-[13px] tabular-nums text-[var(--color-text-faint)]">
                      {plural(hub.articles.length, ITEM_WORDS)} · {minutes} хв
                    </span>
                    <Link
                      to={`/${hub.hub}`}
                      prefetch="intent"
                      className={`group inline-flex items-center gap-2 rounded-full bg-white/[0.06] py-1.5 pr-1.5 pl-4 text-sm font-medium text-[var(--color-text)] transition-colors duration-500 ${EASE_CLASS} hover:bg-white/[0.1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]`}
                    >
                      Весь розділ
                      <span
                        className={`grid size-7 place-items-center rounded-full bg-white/[0.08] transition-[background-color,color] duration-500 ${EASE_CLASS} group-hover:bg-[var(--color-accent)] group-hover:text-[var(--color-bg)]`}
                      >
                        <IconArrowUpRight
                          className={`size-3.5 transition-transform duration-500 ${EASE_CLASS} group-hover:translate-x-0.5 group-hover:-translate-y-0.5`}
                        />
                      </span>
                    </Link>
                  </div>
                </div>

                <ol className="divide-y divide-white/[0.06]">
                  {hub.articles.map((article, index) => (
                    <li key={article.path}>
                      <Link
                        to={article.path}
                        prefetch="intent"
                        className={`group flex items-center gap-4 px-6 py-4 transition-colors duration-500 ${EASE_CLASS} hover:bg-white/[0.03] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)] sm:px-8`}
                      >
                        <span className="w-6 shrink-0 text-[13px] tabular-nums text-[var(--color-text-faint)]">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span className="min-w-0 flex-1 text-[15px] leading-snug text-[var(--color-text)]">
                          {article.title}
                        </span>
                        <span className="hidden shrink-0 text-[13px] tabular-nums text-[var(--color-text-faint)] sm:inline">
                          {article.minutes} хв
                        </span>
                        <span
                          aria-hidden="true"
                          className={`grid size-7 shrink-0 place-items-center rounded-full text-[var(--color-text-faint)] transition-[background-color,color] duration-500 ${EASE_CLASS} group-hover:bg-[var(--color-accent)] group-hover:text-[var(--color-bg)]`}
                        >
                          <IconArrowUpRight className="size-3.5" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
