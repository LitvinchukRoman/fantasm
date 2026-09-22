"use client";

import { useEffect, useState } from "react";
import type { TocItem } from "@/lib/content";
import { cn } from "@/lib/utils";

/** Table of contents with scroll-spy. Sticky on desktop; hidden on mobile. */
export function Toc({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    if (items.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    items.forEach((it) => {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 3) return null;

  return (
    <nav aria-label="Зміст" className="text-sm">
      <div className="text-caption mb-3">Зміст</div>
      <ul className="space-y-1.5 border-l border-[var(--line)]">
        {items.map((it) => (
          <li key={it.id} style={{ paddingLeft: it.depth === 3 ? 20 : 12 }}>
            <a
              href={`#${it.id}`}
              className={cn(
                "-ml-px block border-l-2 py-0.5 transition-colors",
                active === it.id
                  ? "border-[var(--accent)] text-[color:var(--ink)]"
                  : "border-transparent text-[color:var(--ink-2)] hover:text-[color:var(--ink)]",
              )}
            >
              {it.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
