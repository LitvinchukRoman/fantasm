import { useEffect, useRef, useState } from "react";
import { GuideFrame } from "~/components/guides/frame";
import { IdeaCard } from "~/components/ideas/idea-card";
import { CATEGORY_LABELS, getIdeas, NAUKMA, type Idea, type IdeaCategory, type IdeaTag } from "~/lib/ideas";

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
  children,
}: {
  label: string;
  value?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative max-sm:static">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={
          "group rounded-full px-3 py-1.5 text-sm transition-all duration-200 active:scale-[0.97] " +
          (open || value
            ? "bg-[var(--color-surface-strong)] text-[var(--color-text)]"
            : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-strong)] hover:text-[var(--color-text)]")
        }
      >
        <span className="inline-block transition-transform duration-200 group-hover:-translate-y-[0.5px]">
          {label}
          {value ? <span className="text-[var(--color-accent)]"> · {value}</span> : null}
        </span>
      </button>
      {open && (
        <div className="absolute top-full z-30 mt-2 rounded-[20px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-[0_24px_48px_rgb(0_0_0/0.45)] max-sm:inset-x-0 max-sm:w-auto sm:left-0 sm:w-[min(20rem,calc(100vw-2.5rem))]">
          {children}
        </div>
      )}
    </div>
  );
}

/** Площина з прямих ліній. Сірий той самий, що ореол сфери на головній. */
function SpaceLines() {
  const vanishX = 68;
  const vanishY = 34;
  const across = [96, 86, 77, 69, 62, 56, 51, 46, 42, 38];
  const depth = [-8, 8, 22, 36, 50, 64, 78, 92, 108];
  const stroke = {
    stroke: "#d8d8d8",
    strokeWidth: 0.06,
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none fixed inset-0 z-0 h-dvh w-full"
    >
      <defs>
        <linearGradient id="ideas-plane-fade" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0.55" />
          <stop offset="0.45" stopColor="white" stopOpacity="0.22" />
          <stop offset="0.72" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="ideas-plane">
          <rect width="100" height="100" fill="url(#ideas-plane-fade)" />
        </mask>
      </defs>
      <g mask="url(#ideas-plane)" fill="none" {...stroke}>
        {across.map((y) => (
          <line key={`h-${y}`} x1="0" y1={y} x2="100" y2={y} />
        ))}
        {depth.map((x) => (
          <line key={`d-${x}`} x1={x} y1="100" x2={vanishX} y2={vanishY} />
        ))}
      </g>
    </svg>
  );
}

export function loader() {
  return { ideas: getIdeas() };
}

export function meta() {
  return [
    { title: "Ідеї, Fantasm" },
    { name: "description", content: "Стрічка ідей спільноти: стартапи, події, клуби й волонтерство." },
  ];
}

export default function IdeasPage({ loaderData }: { loaderData: { ideas: Idea[] } }) {
  const barRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuId | null>(null);
  const [category, setCategory] = useState<IdeaCategory | null>(null);
  const [dateWindow, setDateWindow] = useState<DateWindow>("all");
  const [campus, setCampus] = useState<CampusFilter>("all");
  const [sort, setSort] = useState<SortKey>("new");
  const [tags, setTags] = useState<string[]>([]);

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

  const now = Date.now();
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

  return (
    <GuideFrame>
      <SpaceLines />
      <div className="relative z-10 mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold text-[var(--color-text)]">Ідеї</h1>
        <div ref={barRef} className="relative mt-5 flex flex-wrap items-center gap-1">
          <FilterMenu
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
                setCategory(null);
                setDateWindow("all");
                setCampus("all");
                setSort("new");
                setTags([]);
                setMenu(null);
              }}
              className="px-3 py-1.5 text-sm text-[var(--color-text-faint)] hover:text-[var(--color-text)]"
            >
              Скинути
            </button>
          )}
        </div>
        {ideas.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--color-text-muted)]">Нічого не знайшлось за цими фільтрами.</p>
        ) : (
          <ul className="mt-8 space-y-4">
            {ideas.map((idea, index) => (
              <li key={idea.slug} className="animate-fade-up" style={{ animationDelay: `${index * 60}ms` }}>
                <IdeaCard idea={idea} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </GuideFrame>
  );
}
