import { useEffect, useRef, useState } from "react";
import type { TocItem } from "~/lib/content-meta";

/** Зміст: клік плавно веде до розділу, риска їде за активним пунктом із зазором до тексту. */
export function Toc({ items }: { items: TocItem[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const linkRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [active, setActive] = useState(items[0]?.id ?? "");
  const [bar, setBar] = useState({ top: 0, height: 0 });

  useEffect(() => {
    if (items.length === 0) return;

    const pick = () => {
      const offset = 120;
      let current = items[0]?.id ?? "";
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= offset) current = item.id;
      }
      // Останні розділи часто коротші за екран і ніколи не доходять до лінії
      // offset: внизу сторінки активний останній пункт, який уже видно.
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) {
        for (const item of items) {
          const el = document.getElementById(item.id);
          if (el && el.getBoundingClientRect().top < window.innerHeight) current = item.id;
        }
      }
      setActive(current);
    };

    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    // Розгорнуте питання FAQ чи підвантажений шрифт змінюють висоту без події scroll.
    const observer = new ResizeObserver(pick);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
      observer.disconnect();
    };
  }, [items]);

  useEffect(() => {
    const list = listRef.current;
    const link = linkRefs.current[active];
    if (!list || !link) return;

    const measure = () => {
      const listBox = list.getBoundingClientRect();
      const linkBox = link.getBoundingClientRect();
      setBar({
        top: linkBox.top - listBox.top,
        height: linkBox.height,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [active, items]);

  if (items.length < 3) return null;

  return (
    <nav aria-label="Зміст" className="text-sm">
      <div className="mb-3 text-xs font-medium tracking-wide text-[var(--color-text-faint)] uppercase">
        Зміст
      </div>
      <ul ref={listRef} className="relative border-l border-[var(--color-border)]">
        <span
          aria-hidden="true"
          className="absolute -left-px w-0.5 bg-[var(--color-accent)] transition-[top,height] duration-300 ease-out"
          style={{ top: bar.top, height: bar.height }}
        />
        {items.map((item) => {
          const current = active === item.id;
          return (
            <li key={item.id}>
              <a
                ref={(node) => {
                  linkRefs.current[item.id] = node;
                }}
                href={`#${item.id}`}
                aria-current={current ? "location" : undefined}
                className={
                  "block py-1.5 pr-2 transition-colors " +
                  (item.depth === 3 ? "pl-12 " : "pl-7 ") +
                  (current
                    ? "font-medium text-[var(--color-accent)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]")
                }
                onClick={(event) => {
                  const target = document.getElementById(item.id);
                  if (!target) return;
                  event.preventDefault();
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                  history.pushState(null, "", `#${item.id}`);
                  setActive(item.id);
                }}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
