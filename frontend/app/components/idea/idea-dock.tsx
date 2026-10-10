import { useEffect, useState } from "react";
import { ActionDock } from "~/components/ui/action-dock";

/** Id блоку дій у шапці: коли він пішов угору за екран, дії з'являються в доку. */
export const IDEA_ACTIONS_ID = "idea-actions";

/** Ті самі дії, що в шапці (їх передає сторінка: у власника вони інші), плюс перехід до обговорення. */
export function IdeaDock({ comments, children }: { comments: number; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = document.getElementById(IDEA_ACTIONS_ID);
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <ActionDock label="Дії з ідеєю" visible={visible}>
      {children}
      <a
        href="#discussion"
        aria-label={`Обговорення, дописів: ${comments}`}
        className="flex items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium whitespace-nowrap text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] sm:px-4"
      >
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 5.5h12v8H7.5L4 16.5V5.5Z" strokeLinejoin="round" />
        </svg>
        <span className="hidden sm:inline">Обговорення ·</span>
        <span className="tabular-nums">{comments}</span>
      </a>
    </ActionDock>
  );
}
