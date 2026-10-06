import { useEffect, useRef, type MouseEvent } from "react";
import { useNavigate } from "react-router";

/**
 * Готовий HTML з лоадера (див. lib/markdown.server.tsx). Внутрішні посилання
 * в тексті — звичайні <a>, тому клік перехоплюється і йде через роутер,
 * інакше кожен перехід між гайдами перезавантажував би сторінку повністю.
 */
export function GuideMarkdown({ html }: { html: string }) {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);

  // Широка таблиця гортається вбік: поки праворуч є ще колонки, `data-more` вмикає затухання краю (див. .guide-table у app.css).
  useEffect(() => {
    const tables = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>(".guide-table") ?? [],
    );
    const cleanups = tables.map((table) => {
      const update = () => {
        const more =
          table.scrollLeft + table.clientWidth < table.scrollWidth - 2;
        if (more) table.setAttribute("data-more", "");
        else table.removeAttribute("data-more");
      };
      update();
      table.addEventListener("scroll", update, { passive: true });
      const observer = new ResizeObserver(update);
      observer.observe(table);
      return () => {
        table.removeEventListener("scroll", update);
        observer.disconnect();
      };
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [html]);

  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (
      !anchor ||
      !href ||
      !href.startsWith("/") ||
      href.startsWith("//") ||
      anchor.target
    )
      return;
    event.preventDefault();
    navigate(href);
  }

  return (
    <div
      ref={rootRef}
      className="prose-guide"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
