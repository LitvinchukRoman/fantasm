import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { ActionDock } from "~/components/ui/action-dock";
import { VoteControl } from "./vote-control";

/** Id блоку дій у шапці: коли він пішов угору за екран, дії з'являються в доку. */
export const IDEA_ACTIONS_ID = "idea-actions";

export function IdeaDock({ votes, comments, isEvent }: { votes: number; comments: number; isEvent: boolean }) {
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
      <VoteControl score={votes} size="sm" />
      <Button to="/login" variant="secondary" size="sm">
        {isEvent ? "Я піду" : "Долучитися"}
      </Button>
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
