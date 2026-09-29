import { useEffect, useRef, useState } from "react";
import { useSearchParams, type ShouldRevalidateFunctionArgs } from "react-router";
import { CurvedRows } from "~/components/ideas/curved-rows";
import { IdeaRow } from "~/components/ideas/idea-row";
import { IdeasBackground } from "~/components/ideas/ideas-background";
import { Nav } from "~/components/landing/nav";
import { CATEGORY_LABELS, NAUKMA, type IdeaCategory, type IdeaTag } from "~/lib/ideas";
import { getIdeas, toCard } from "~/lib/ideas.server";
import { seo } from "~/lib/seo";
import { breadcrumbList, collectionPage, itemList } from "~/lib/structured-data";
import { useHydrated } from "~/lib/use-hydrated";
import type { Route } from "./+types/ideas";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as IdeaCategory[];

const TYPE_HINTS: Record<IdeaCategory, string> = {
  STARTUP: "Продукт, який шукає команду",
  PROJECT: "Спільна справа з конкретними ролями",
  EVENT: "Зустріч із датою і місцем",
  COMMUNITY: "Клуб або регулярна ініціатива",
  OTHER: "Те, що не лягає в інші види",
};

type DateWindow = "all" | "7" | "30";
type CampusFilter = "all" | "naukma" | "none";
type SortKey = "new" | "old" | "votes";
type MenuId = "type" | "date" | "campus" | "tags" | "sort";

const DAY = 86_400_000;

function FilterOption({
  title,
  hint,
  selected,
  onClick,
}: {
  title: string;
  hint: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={
        "block w-full min-w-0 rounded-xl px-3 py-2.5 text-left " +
        (selected ? "bg-[var(--color-surface-strong)]" : "hover:bg-[var(--color-surface-strong)]")
      }
    >
      <span className={"block text-sm font-medium wrap-anywhere " + (selected ? "text-[var(--color-accent)]" : "text-[var(--color-text)]")}>
        {title}
      </span>
      <span className="mt-0.5 block text-xs leading-snug text-[var(--color-text-muted)]">{hint}</span>
    </button>
  );
}

function FilterMenu({
  label,
  value,
  open,
  onToggle,
  up = false,
  children,
}: {
  label: string;
  value?: string;
  open: boolean;
  onToggle: () => void;
  /** Випадає вгору й вирівнюється по правому краю: для панелі в нижньому правому куті. */
  up?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative max-sm:static">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={
          "rounded-full px-3 py-1.5 text-sm " +
          (open || value
            ? "bg-[var(--color-surface-strong)] text-[var(--color-text)]"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]")
        }
      >
        {label}
        {value ? <span className="text-[var(--color-accent)]"> · {value}</span> : null}
      </button>
      {open && (
        <div data-curve-ignore className={(up ? "absolute bottom-full right-0 z-30 mb-3" : "absolute top-full z-30 mt-2 sm:left-0") + " rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[0_24px_48px_rgb(0_0_0/0.45)] max-sm:inset-x-0 max-sm:w-auto sm:w-[min(20rem,calc(100vw-2.5rem))]"}>
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Вигнута нескінченна стрічка потрібна лише там, де є колесо й наведення, і тільки без reduced motion.
 * Пререндер і мобільні отримують звичайний список тих самих рядків.
 */
function useCurvedMode(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(wide.matches && !calm.matches);
    update();
    wide.addEventListener("change", update);
    calm.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      calm.removeEventListener("change", update);
    };
  }, []);
  return enabled;
}

const TITLE = "Ідеї, Fantasm";
const DESCRIPTION = "Стрічка ідей спільноти: стартапи, події, клуби й волонтерство.";

export function loader() {
  return { ideas: getIdeas().map(toCard) };
}

/** Фільтри живуть у query-рядку і застосовуються на клієнті: лоадер від них не залежить. */
export function shouldRevalidate({ currentUrl, nextUrl, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  if (currentUrl.pathname === nextUrl.pathname) return false;
  return defaultShouldRevalidate;
}

export function meta({ data }: Route.MetaArgs) {
  const indexable = data?.ideas.filter((idea) => !idea.fixture) ?? [];
  return seo({
    title: TITLE,
    description: DESCRIPTION,
    // Відфільтровані варіанти (?tag=…) — та сама сторінка, canonical завжди без query.
    path: "/ideas",
    jsonLd: [
      collectionPage({ name: TITLE, description: DESCRIPTION, path: "/ideas" }),
      breadcrumbList([
        { name: "Головна", path: "/" },
        { name: "Ідеї", path: "/ideas" },
      ]),
      ...(indexable.length > 0
        ? [itemList(indexable.map((idea) => ({ name: idea.title, path: `/ideas/${idea.slug}` })))]
        : []),
    ],
  });
}

const SORT_KEYS: SortKey[] = ["new", "old", "votes"];

function readFilters(params: URLSearchParams) {
  const type = params.get("type")?.toUpperCase() as IdeaCategory | undefined;
  const date = params.get("date");
  const campus = params.get("campus");
  const sort = params.get("sort") as SortKey | null;
  return {
    category: type && CATEGORIES.includes(type) ? type : null,
    dateWindow: (date === "7" || date === "30" ? date : "all") as DateWindow,
    campus: (campus === "naukma" || campus === "none" ? campus : "all") as CampusFilter,
    sort: sort && SORT_KEYS.includes(sort) ? sort : ("new" as SortKey),
    tags: params.getAll("tag"),
  };
}

type Filters = ReturnType<typeof readFilters>;

function writeFilters(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.category) params.set("type", filters.category.toLowerCase());
  if (filters.dateWindow !== "all") params.set("date", filters.dateWindow);
  if (filters.campus !== "all") params.set("campus", filters.campus);
  if (filters.sort !== "new") params.set("sort", filters.sort);
  for (const tag of filters.tags) params.append("tag", tag);
  return params;
}

const EMPTY_FILTERS = readFilters(new URLSearchParams());

export default function IdeasPage({ loaderData }: Route.ComponentProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuId | null>(null);
  // Точка відліку для «за 7/30 днів»; фільтр дати діє лише після гідрації.
  const [now] = useState(() => Date.now());
  const [searchParams, setSearchParams] = useSearchParams();
  // Пререндерений HTML зібраний без query: до гідрації рендеримо стрічку без
  // фільтрів, щоб розмітка збіглася, а фільтри з URL застосовуємо одразу після.
  const hydrated = useHydrated();
  const filters = hydrated ? readFilters(searchParams) : EMPTY_FILTERS;
  const { category, dateWindow, campus, sort, tags } = filters;

  function update(patch: Partial<Filters>) {
    setSearchParams(writeFilters({ ...filters, ...patch }), { replace: true, preventScrollReset: true });
  }
  const setCategory = (value: IdeaCategory | null) => update({ category: value });
  const setDateWindow = (value: DateWindow) => update({ dateWindow: value });
  const setCampus = (value: CampusFilter) => update({ campus: value });
  const setSort = (value: SortKey) => update({ sort: value });
  const setTags = (next: string[] | ((current: string[]) => string[])) =>
    update({ tags: typeof next === "function" ? next(tags) : next });

  const tagOptions: IdeaTag[] = [
    ...new Map(loaderData.ideas.flatMap((idea) => idea.tags).map((tag) => [tag.slug, tag])).values(),
  ];

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!barRef.current?.contains(event.target as Node)) setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function toggleMenu(id: MenuId) {
    setMenu((current) => (current === id ? null : id));
  }

  function choose<T>(id: MenuId, apply: (value: T) => void) {
    return (value: T) => {
      apply(value);
      setMenu(id === "tags" ? id : null);
    };
  }

  const ideas = loaderData.ideas
    .filter((idea) => {
      if (category && idea.category !== category) return false;
      if (campus === "naukma" && idea.campus?.id !== NAUKMA.id) return false;
      if (campus === "none" && idea.campus) return false;
      if (tags.length > 0 && !idea.tags.some((tag) => tags.includes(tag.slug))) return false;
      const age = now - Date.parse(idea.createdAt);
      if (dateWindow === "7" && age > 7 * DAY) return false;
      if (dateWindow === "30" && age > 30 * DAY) return false;
      return true;
    })
    .sort((a, b) => {
      if (sort === "votes") return b.votes - a.votes;
      const delta = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      return sort === "old" ? -delta : delta;
    });

  const dirty = category !== null || dateWindow !== "all" || campus !== "all" || sort !== "new" || tags.length > 0;

  const curved = useCurvedMode() && ideas.length >= 2;

  useEffect(() => {
    if (!curved) return;
    document.documentElement.classList.add("ideas-curved");
    return () => document.documentElement.classList.remove("ideas-curved");
  }, [curved]);

  const filterBar = (
    <div ref={barRef} className="relative flex flex-wrap items-center gap-1">
      <FilterMenu
        up={curved}
        label="Тип"
        value={category ? CATEGORY_LABELS[category] : undefined}
        open={menu === "type"}
        onToggle={() => toggleMenu("type")}
      >
        <FilterOption title="Усі" hint="Без обмеження за видом" selected={category === null} onClick={() => choose("type", setCategory)(null)} />
        {CATEGORIES.map((item) => (
          <FilterOption
            key={item}
            title={CATEGORY_LABELS[item]}
            hint={TYPE_HINTS[item]}
            selected={category === item}
            onClick={() => choose("type", setCategory)(item)}
          />
        ))}
      </FilterMenu>
      <FilterMenu
        up={curved}
        label="Дата"
        value={dateWindow === "7" ? "7 днів" : dateWindow === "30" ? "30 днів" : undefined}
        open={menu === "date"}
        onToggle={() => toggleMenu("date")}
      >
        <FilterOption title="Будь-коли" hint="Вся стрічка" selected={dateWindow === "all"} onClick={() => choose("date", setDateWindow)("all")} />
        <FilterOption title="За 7 днів" hint="Опубліковані цього тижня" selected={dateWindow === "7"} onClick={() => choose("date", setDateWindow)("7")} />
        <FilterOption title="За 30 днів" hint="Опубліковані цього місяця" selected={dateWindow === "30"} onClick={() => choose("date", setDateWindow)("30")} />
      </FilterMenu>
      <FilterMenu
        up={curved}
        label="Кампус"
        value={campus === "naukma" ? NAUKMA.label : campus === "none" ? "Без кампусу" : undefined}
        open={menu === "campus"}
        onToggle={() => toggleMenu("campus")}
      >
        <FilterOption title="Усі" hint="З кампусом і без нього" selected={campus === "all"} onClick={() => choose("campus", setCampus)("all")} />
        <FilterOption title={NAUKMA.label} hint="Лише ідеї цього кампусу" selected={campus === "naukma"} onClick={() => choose("campus", setCampus)("naukma")} />
        <FilterOption title="Без кампусу" hint="Відкриті ідеї без печатки кампусу" selected={campus === "none"} onClick={() => choose("campus", setCampus)("none")} />
      </FilterMenu>
      <FilterMenu
        up={curved}
        label="Теги"
        value={tags.length > 0 ? String(tags.length) : undefined}
        open={menu === "tags"}
        onToggle={() => toggleMenu("tags")}
      >
        <FilterOption title="Усі" hint="Без обмеження за тегами" selected={tags.length === 0} onClick={() => setTags([])} />
        <div className="grid grid-cols-2 gap-1">
          {tagOptions.map((tag) => {
            const on = tags.includes(tag.slug);
            const count = loaderData.ideas.filter((idea) => idea.tags.some((item) => item.slug === tag.slug)).length;
            return (
              <FilterOption
                key={tag.slug}
                title={`#${tag.label}`}
                hint={`${count} у стрічці`}
                selected={on}
                onClick={() =>
                  setTags((current) => (on ? current.filter((slug) => slug !== tag.slug) : [...current, tag.slug]))
                }
              />
            );
          })}
        </div>
      </FilterMenu>
      <FilterMenu
        up={curved}
        label="Порядок"
        value={sort === "old" ? "Старіші" : sort === "votes" ? "Голоси" : undefined}
        open={menu === "sort"}
        onToggle={() => toggleMenu("sort")}
      >
        <FilterOption title="Новіші" hint="Спочатку щойно опубліковані" selected={sort === "new"} onClick={() => choose("sort", setSort)("new")} />
        <FilterOption title="Старіші" hint="Спочатку давніші" selected={sort === "old"} onClick={() => choose("sort", setSort)("old")} />
        <FilterOption title="Голоси" hint="Спочатку з більшою підтримкою" selected={sort === "votes"} onClick={() => choose("sort", setSort)("votes")} />
      </FilterMenu>
      {dirty && (
        <button
          type="button"
          onClick={() => {
            setSearchParams(new URLSearchParams(), { replace: true, preventScrollReset: true });
            setMenu(null);
          }}
          className="px-3 py-1.5 text-sm text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
        >
          Скинути
        </button>
      )}
    </div>
  );
  const numberOf = (index: number) => String(index + 1).padStart(2, "0");

  return (
    <div className="min-h-dvh">
      <IdeasBackground />
      <Nav key={curved ? "overlay" : "solid"} forceSolid={!curved} />
      {curved ? (
        <>
          <div className="ideas-overlay-top" aria-hidden="true" />
          <div className="ideas-overlay-bottom" aria-hidden="true" />
          <div className="pointer-events-none fixed inset-x-0 top-16 z-20">
            <div className="idea-rail">
              <h1 className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Ідеї · {ideas.length}</h1>
            </div>
          </div>
          <div className="fixed right-6 bottom-6 z-30 max-w-[calc(100vw-3rem)] rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)]/80 px-2 py-1.5 backdrop-blur-md">
            {filterBar}
          </div>
          <CurvedRows
            items={ideas}
            keyOf={(idea) => idea.slug}
            renderRow={(idea, index, decorative) => <IdeaRow idea={idea} number={numberOf(index)} decorative={decorative} />}
          />
        </>
      ) : (
        <main className="relative z-10 mx-auto max-w-3xl px-5 pt-24 pb-20 sm:px-8">
          <h1 className="text-3xl font-semibold text-[var(--color-text)]">Ідеї</h1>
          <div className="mt-5">{filterBar}</div>
          {ideas.length === 0 ? (
            <p className="mt-8 text-sm text-[var(--color-text-muted)]">Нічого не знайшлось за цими фільтрами.</p>
          ) : (
            <ul className="idea-rows idea-rows--flow mt-8">
              {ideas.map((idea, index) => (
                <li key={idea.slug}>
                  <IdeaRow idea={idea} number={numberOf(index)} />
                </li>
              ))}
            </ul>
          )}
        </main>
      )}
    </div>
  );
}
