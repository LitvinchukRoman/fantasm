import { Link } from "react-router";
import { IdeaRow } from "~/components/ideas/idea-row";
import type { IdeaCard } from "~/lib/ideas";
import { EmptyState } from "./empty-state";
import { IconArrowRight, IconFlame, IconPenLine } from "./icons";

/**
 * «Гарячі зараз»: ті самі рядки, що в стрічці `/ideas`, а не окремі картки. Це міст між регістрами:
 * лендінг («Історія») показує живий вигляд стрічки («Сигнал»), тож перехід далі не стрибок.
 * Поки ідей немає, лишається чесний порожній стан (текст як у MVP).
 */
export function HotFeedTeaser({ ideas }: { ideas: IdeaCard[] }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="flex items-end justify-between gap-4">
        <h2 className="flex items-center gap-2 text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
          <IconFlame className="size-6 text-[var(--color-accent)]" />
          Гарячі зараз
        </h2>
        <Link
          to="/ideas"
          prefetch="intent"
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] transition-transform hover:scale-105 hover:underline"
        >
          Усі ідеї
          <IconArrowRight className="size-4" />
        </Link>
      </div>

      <div className="mt-8">
        {ideas.length > 0 ? (
          <ul className="idea-rows idea-rows--flow">
            {ideas.map((idea, index) => (
              <li key={idea.slug}>
                <IdeaRow idea={idea} number={String(index + 1).padStart(2, "0")} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={IconPenLine}
            title="Тут з'явиться перша ідея"
            body="Станьте першим, хто поділиться ідеєю зі спільнотою."
            actionHref="/ideas/new"
            actionLabel="Запропонувати ідею"
          />
        )}
      </div>
    </section>
  );
}
