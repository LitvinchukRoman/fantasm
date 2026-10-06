import { useEffect, useRef, useState } from "react";
import { useSearchParams, type ShouldRevalidateFunctionArgs } from "react-router";
import { CurvedRows } from "~/components/ideas/curved-rows";
import { FilterMenu, FilterOption, FilterPanelHeader, FilterReset, FilterToggle } from "~/components/ideas/filter-bar";
import { IdeaRow } from "~/components/ideas/idea-row";
import { IdeasBackground } from "~/components/ideas/ideas-background";
import { IconChevronDown } from "~/components/landing/icons";
import { Nav } from "~/components/landing/nav";
import { ActionDock } from "~/components/ui/action-dock";
import { Button } from "~/components/ui/button";
import { HudLabel } from "~/components/ui/hud-label";
import { SiteFooter } from "~/components/ui/site-footer";
import { CATEGORY_LABELS, NAUKMA, type IdeaCategory, type IdeaTag } from "~/lib/ideas";
import { getIdeas, toCard } from "~/lib/ideas.server";
import { seo } from "~/lib/seo";
import { breadcrumbList, collectionPage, itemList } from "~/lib/structured-data";
import { readFeedPosition, saveFeedPosition } from "~/lib/feed-position";
import { canCurve, useCurvedMode } from "~/lib/use-curved-mode";
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
  // Телефон: фільтри сховані за однією кнопкою, щоб не нагромаджувати екран; вигнута стрічка (десктоп) цього не потребує.
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Точка відліку для «за 7/30 днів»; фільтр дати діє лише після гідрації.
  const [now] = useState(() => Date.now());
  const [searchParams, setSearchParams] = useSearchParams();
  // Пререндерений HTML зібраний без query: до гідрації рендеримо стрічку без
  // фільтрів, щоб розмітка збіглася, а фільтри з URL застосовуємо одразу після.
  const hydrated = useHydrated();
  const filters = hydrated ? readFilters(searchParams) : EMPTY_FILTERS;
  const { category, dateWindow, campus, sort, tags } = filters;

  // Остання відома комбінація фільтрів. URL оновлюється асинхронно, тож два швидкі кліки поспіль
  // не повинні читати застарілий стан і губити перший вибір: від порядку натискань результат не залежить.
  const latest = useRef(filters);
  useEffect(() => {
    latest.current = filters;
  });
  function update(patch: Partial<Filters>) {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setSearchParams(writeFilters(next), { replace: true, preventScrollReset: true });
  }
  function reset() {
    latest.current = EMPTY_FILTERS;
    setSearchParams(new URLSearchParams(), { replace: true, preventScrollReset: true });
    setMenu(null);
  }
  const setCategory = (value: IdeaCategory | null) => update({ category: value });
  const setDateWindow = (value: DateWindow) => update({ dateWindow: value });
  const setCampus = (value: CampusFilter) => update({ campus: value });
  const setSort = (value: SortKey) => update({ sort: value });
  const setTags = (next: string[]) => update({ tags: next });
  const toggleTag = (slug: string) =>
    update({ tags: latest.current.tags.includes(slug) ? latest.current.tags.filter((item) => item !== slug) : [...latest.current.tags, slug] });

  const tagOptions: IdeaTag[] = [
    ...new Map(loaderData.ideas.flatMap((idea) => idea.tags).map((tag) => [tag.slug, tag])).values(),
  ];

  const tagCounts = new Map<string, number>();
  for (const idea of loaderData.ideas) for (const tag of idea.tags) tagCounts.set(tag.slug, (tagCounts.get(tag.slug) ?? 0) + 1);

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

  // Режим (вигнута стрічка з панеллю фільтрів знизу чи плоский список) залежить лише від пристрою, а не від кількості
  // результатів: інакше фільтр, що лишає 0–1 ідею, перекидав би панель нагору просто під пальцем.
  const curved = useCurvedMode();

  useEffect(() => {
    if (!curved) return;
    document.documentElement.classList.add("ideas-curved");
    return () => document.documentElement.classList.remove("ideas-curved");
  }, [curved]);

  // Плоский список (мобайл): повертаємо scrollY, коли вертаємось у стрічку не кнопкою «назад» (її обробляє ScrollRestoration).
  const feedSignature = ideas.map((idea) => idea.slug).join("|");
  useEffect(() => {
    if (!hydrated || canCurve()) return;
    const saved = readFeedPosition("flat", feedSignature);
    const frame = saved !== null ? requestAnimationFrame(() => window.scrollTo(0, saved)) : 0;
    const remember = () => saveFeedPosition("flat", feedSignature, window.scrollY);
    window.addEventListener("pagehide", remember);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      remember();
      window.removeEventListener("pagehide", remember);
    };
  }, [hydrated, feedSignature]);

  const activeCount = (category ? 1 : 0) + (dateWindow !== "all" ? 1 : 0) + (campus !== "all" ? 1 : 0) + (sort !== "new" ? 1 : 0) + tags.length;

  const filterBar = (
    <div className="relative">
    <div className="flex items-center gap-1.5 sm:hidden">
      <button
        type="button"
        aria-expanded={filtersOpen}
        onClick={() => {
          setFiltersOpen((open) => !open);
          setMenu(null);
        }}
        className={`inline-flex h-8 items-center gap-2 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors duration-150 ${
          activeCount > 0 ? "border-[var(--color-accent)] text-[var(--color-text)]" : "border-[var(--color-border-strong)] text-[var(--color-text-muted)]"
        }`}
      >
        Фільтри
        {activeCount > 0 && <span className="tabular-nums text-[var(--color-accent)]">{activeCount}</span>}
        <IconChevronDown className={`size-4 transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`} />
      </button>
      {dirty && <FilterReset onClick={reset} />}
    </div>
    <div className={filtersOpen ? "max-sm:mt-2" : "max-sm:hidden"}>
    <div
      ref={barRef}
      // Телефон: фільтри в один горизонтальний ряд на всю ширину екрана (з затуханням праворуч), без «осиротілої» пігулки на новому рядку.
      className="relative flex items-center gap-1.5 max-sm:-mx-5 max-sm:overflow-x-auto max-sm:px-5 max-sm:pb-1 max-sm:[scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden"
    >
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
        <FilterPanelHeader
          title="Будь-який із вибраних"
          action={
            tags.length > 0 ? (
              <button type="button" onClick={() => setTags([])} className="text-xs text-[var(--color-text-faint)] hover:text-[var(--color-text)]">
                Очистити
              </button>
            ) : undefined
          }
        />
        <div className="flex flex-wrap gap-1.5 px-2 pt-1 pb-2">
          {tagOptions.map((tag) => (
            <FilterToggle
              key={tag.slug}
              label={tag.label}
              count={tagCounts.get(tag.slug) ?? 0}
              on={tags.includes(tag.slug)}
              onClick={() => toggleTag(tag.slug)}
            />
          ))}
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
      {dirty && <FilterReset onClick={reset} className="max-sm:hidden" />}
    </div>
    {/* Затухання правого краю підказує, що ряд гортається; окремий шар, бо маска на самому ряду сховала б і шторку. */}
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 -right-5 w-8 bg-gradient-to-l from-[var(--color-bg)] to-transparent sm:hidden"
    />
    </div>
    </div>
  );
  const emptyState = (
    <div className="border-y border-dashed border-[var(--color-border-strong)] px-6 py-14 text-center">
      <p className="text-[var(--color-text)]">{dirty ? "Нічого не знайшлось за цими фільтрами" : "Тут з'явиться перша ідея"}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">
        {dirty ? "Спробуй послабити умови або скинь фільтри." : "Станьте першим, хто поділиться ідеєю зі спільнотою."}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        {dirty && (
          <Button variant="secondary" onClick={reset}>
            Скинути фільтри
          </Button>
        )}
        <Button to="/ideas/new" arrow>
          Запропонувати ідею
        </Button>
      </div>
    </div>
  );
  const numberOf = (index: number) => String(index + 1).padStart(2, "0");

  return (
    <div className="flex min-h-dvh flex-col">
      <IdeasBackground interactive={false} />
      <Nav key={curved ? "overlay" : "solid"} forceSolid={!curved} />
      {curved ? (
        <>
          <div className="ideas-overlay-top" aria-hidden="true" />
          <div className="ideas-overlay-bottom" aria-hidden="true" />
          <div className="pointer-events-none fixed inset-x-0 top-16 z-20">
            <div className="idea-rail">
              <HudLabel as="h1" className="!text-[var(--color-text-muted)]">
                Ідеї · {ideas.length}
              </HudLabel>
            </div>
          </div>
          <div className="fixed right-6 bottom-6 z-30 max-w-[calc(100vw-3rem)] rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)]/80 px-2 py-1.5 backdrop-blur-md">
            {filterBar}
          </div>
          {ideas.length >= 2 ? (
            <CurvedRows
              items={ideas}
              keyOf={(idea) => idea.slug}
              renderRow={(idea, index, decorative) => <IdeaRow idea={idea} number={numberOf(index)} decorative={decorative} />}
            />
          ) : (
            // 0–1 результат: зациклювати нічого, показуємо його на місці, а панель фільтрів лишається там само.
            <div className="fixed inset-0 z-[1] flex items-center">
              <div className="idea-rail">
                {ideas.length === 0 ? (
                  emptyState
                ) : (
                  <ul className="idea-rows idea-rows--flow">
                    {ideas.map((idea, index) => (
                      <li key={idea.slug}>
                        <IdeaRow idea={idea} number={numberOf(index)} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <main className="relative z-10 mx-auto w-full flex-1 max-w-3xl px-5 pt-24 pb-28 sm:px-8">
            <HudLabel as="h1" className="!text-[var(--color-text-muted)]">
              Ідеї · {ideas.length}
            </HudLabel>
            <div className="mt-5">{filterBar}</div>
            {ideas.length === 0 ? (
              <div className="mt-8">{emptyState}</div>
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
          <SiteFooter />
          {ideas.length > 0 && (
            <ActionDock label="Нова ідея" visible={menu === null}>
              <Button to="/ideas/new" size="sm" arrow>
                Запропонувати ідею
              </Button>
            </ActionDock>
          )}
        </>
      )}
    </div>
  );
}
