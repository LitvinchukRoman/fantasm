import { GuideFrame } from "~/components/guides/frame";
import { GuideMarkdown } from "~/components/guides/markdown";
import { VoteControl } from "~/components/ideas/idea-card";
import { CATEGORY_LABELS, eventWhen, getIdea, timeAgo, type Idea } from "~/lib/ideas";

export function loader({ params }: { params: { slug?: string } }) {
  const idea = getIdea(params.slug ?? "");
  if (!idea) throw new Response("Not found", { status: 404 });
  return { idea };
}

export function meta({ data }: { data: { idea: Idea } | undefined }) {
  if (!data) return [{ title: "Ідею не знайдено" }];
  return [
    { title: data.idea.title },
    { name: "description", content: data.idea.summary },
  ];
}

export default function IdeaPage({ loaderData }: { loaderData: { idea: Idea } }) {
  const { idea } = loaderData;
  const isEvent = idea.category === "EVENT" && idea.eventAt;

  return (
    <GuideFrame>
      <article className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section className="idea-head relative flex items-start gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
            <time className="ray-date" dateTime={idea.createdAt}>
              {timeAgo(idea.createdAt)}
            </time>
            <VoteControl score={idea.votes} className="ray-vote" />
            <div className="min-w-0 flex-1 pr-24">
              <p className="ray-kicker">
                {CATEGORY_LABELS[idea.category]}
                {idea.campus ? ` · ${idea.campus.label}` : ""}
                {isEvent ? ` · ${eventWhen(idea.eventAt!)}` : ""}
                {idea.tags.map((tag) => (
                  <a key={tag.slug} href={`/ideas?tag=${tag.slug}`}>
                    {` · #${tag.label}`}
                  </a>
                ))}
              </p>
              <h1 className="ray-title">{idea.title}</h1>
              <p className="ray-summary">{idea.summary}</p>
            </div>
          </section>

          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
            <GuideMarkdown source={idea.body} />
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Обговорення</h2>
            <p className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
              <a href="/login" className="font-medium text-[var(--color-accent)] hover:underline">
                Увійдіть
              </a>
              , щоб долучитися до обговорення.
            </p>
            <p className="text-sm text-[var(--color-text-faint)]">Ще немає коментарів.</p>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {!isEvent && (
            <section className="space-y-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
              <h2 className="font-semibold text-[var(--color-text)]">Команда</h2>
              {idea.needsRoles && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  Шукають: <span className="text-[var(--color-text)]">{idea.needsRoles}</span>
                </p>
              )}
              <a
                href="/login"
                className="inline-flex rounded-[var(--radius-control)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] hover:bg-[var(--color-accent-strong)]"
              >
                Долучитися
              </a>
            </section>
          )}
          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="font-semibold text-[var(--color-text)]">
              Учасники · <span className="tabular-nums">{idea.participants}</span>
            </h2>
            <p className="mt-3 text-sm text-[var(--color-text-faint)]">Ще нікого. Будьте першим.</p>
          </section>
        </aside>
      </article>
    </GuideFrame>
  );
}
