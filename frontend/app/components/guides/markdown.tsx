import type { MouseEvent } from "react";
import { useNavigate } from "react-router";

/**
 * Готовий HTML з лоадера (див. lib/markdown.server.tsx). Внутрішні посилання
 * в тексті — звичайні <a>, тому клік перехоплюється і йде через роутер,
 * інакше кожен перехід між гайдами перезавантажував би сторінку повністю.
 */
export function GuideMarkdown({ html }: { html: string }) {
  const navigate = useNavigate();

  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (!anchor || !href || !href.startsWith("/") || href.startsWith("//") || anchor.target) return;
    event.preventDefault();
    navigate(href);
  }

  return <div className="prose-guide" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
