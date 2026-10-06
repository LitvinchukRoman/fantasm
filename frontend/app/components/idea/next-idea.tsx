import { Link } from "react-router";
import { IconArrowRight } from "~/components/landing/icons";
import { CATEGORY_LABELS, type IdeaNext } from "~/lib/ideas";

/** «Наступна ідея»: великий рядок-посилання внизу, як «Next project» на референсі. Тримає читача в стрічці. */
export function NextIdea({ idea }: { idea: IdeaNext }) {
  return (
    <section aria-labelledby="next-idea" className="mt-24 border-t border-[var(--color-border)] pt-10">
      <Link to={`/ideas/${idea.slug}`} prefetch="intent" className="group block">
        {/* Стрілка в правому верхньому куті: в одному рядку з підписом, тому на мобайлі не падає під текст. */}
        <div className="flex items-center justify-between gap-4">
          <p id="next-idea" className="hud-label">
            Наступна ідея
          </p>
          <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-text)] transition-[background-color,color] duration-300 group-hover:bg-[var(--color-accent)] group-hover:text-[var(--color-bg)]">
            <IconArrowRight className="size-4" />
          </span>
        </div>
        <h2 className="display-entity mt-6 text-[clamp(1.75rem,4.5vw,3.25rem)] transition-colors duration-300 group-hover:text-[var(--color-accent)]">
          {idea.title}
        </h2>
        <p className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[var(--color-text-muted)]">
          <span className="hud-label">{CATEGORY_LABELS[idea.category]}</span>
          <span className="max-w-xl">{idea.summary}</span>
        </p>
      </Link>
    </section>
  );
}
