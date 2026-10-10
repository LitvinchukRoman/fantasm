import { useEffect, useState } from "react";

export type IndexItem = {
  id: string;
  label: string;
  /** Номер розділу `01`; у підпунктів його немає. */
  index?: string;
};

/** Рядок, від якого заголовок вважається «поточним». Близько до scroll-margin розділів. */
const OFFSET = 140;

/**
 * Липкий зміст сторінки `[ ЗМІСТ ]`: розділи ідеї та заголовки її тіла. Активний пункт визначається
 * за позицією заголовків (як у Toc гайдів), а не через IntersectionObserver, бо розділи різної висоти.
 * Лише з lg: на телефоні роль навігації виконує ActionDock.
 */
export function PageIndex({ items }: { items: IndexItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const pick = () => {
      let current = items[0]?.id ?? "";
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= OFFSET) current = item.id;
      }
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) current = items.filter((item) => item.index).at(-1)?.id ?? current;
      setActive(current);
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    return () => {
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, [items]);

  return (
    <nav aria-label="Зміст сторінки" className="hidden lg:block">
      <p className="hud-label mb-4">[ Зміст ]</p>
      <ul className="border-l border-[var(--color-border)]">
        {items.map((item) => {
          const current = active === item.id;
          return (
            <li key={item.id} className="relative">
              {current && <span aria-hidden="true" className="absolute top-0 -left-px h-full w-0.5 bg-[var(--color-accent)]" />}
              <a
                href={`#${item.id}`}
                aria-current={current ? "location" : undefined}
                onClick={(event) => {
                  const target = document.getElementById(item.id);
                  if (!target) return;
                  event.preventDefault();
                  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                  target.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
                  history.pushState(null, "", `#${item.id}`);
                  setActive(item.id);
                }}
                className={`grid grid-cols-[1.5rem_minmax(0,1fr)] items-baseline gap-x-3 py-2 pr-2 pl-4 transition-colors ${item.index ? "" : "text-[13px]"} ${
                  current ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {/* Колонка номера є й у підпунктів: так їхні назви стають рівно під назвами розділів. */}
                <span aria-hidden={!item.index} className={`hud-label tabular-nums ${current ? "!text-[var(--color-accent)]" : ""}`}>
                  {item.index}
                </span>
                <span className="[overflow-wrap:anywhere]">{item.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
