import { data, Link } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { GuideMarkdown } from "~/components/guides/markdown";
import { VoteControl } from "~/components/ideas/idea-card";
import { RelativeTime } from "~/components/ui/relative-time";
import { CATEGORY_LABELS, eventWhen } from "~/lib/ideas";
import { getIdea, toView } from "~/lib/ideas.server";
import { seo } from "~/lib/seo";
import { breadcrumbList, compact, event } from "~/lib/structured-data";
import type { Route } from "./+types/idea";

export function loader({ params }: Route.LoaderArgs) {
  const idea = getIdea(params.slug);
  if (!idea) throw data("Not found", { status: 404 });
  return { idea: toView(idea) };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { idea } = data;
  const path = `/ideas/${idea.slug}`;
  return seo({
    title: `${idea.title}, Fantasm`,
    description: idea.summary,
    path,
    type: "article",
    publishedTime: idea.createdAt,
    modifiedTime: idea.updatedAt,
    noindex: idea.fixture,
    jsonLd: compact([
      breadcrumbList([
        { name: "Головна", path: "/" },
        { name: "Ідеї", path: "/ideas" },
        { name: idea.title, path },
      ]),
      event(idea),
    ]),
  });
}

export default function IdeaPage({ loaderData }: Route.ComponentProps) {
  const { idea } = loaderData;
  const isEvent = idea.category === "EVENT" && idea.eventAt;

  return (
    <GuideFrame>
      <nav aria-label="Хлібні крихти" className="mb-4 flex flex-wrap gap-x-2 text-sm text-[var(--color-text-faint)]">
        <Link to="/" prefetch="intent" className="hover:text-[var(--color-text)]">
          Головна
        </Link>
        <span aria-hidden="true">/</span>
        <Link to="/ideas" prefetch="intent" className="hover:text-[var(--color-text)]">
          Ідеї
        </Link>
      </nav>
      <article className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <section className="idea-head relative flex items-start gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
            <RelativeTime className="ray-date" iso={idea.createdAt} />
            <VoteControl score={idea.votes} className="ray-vote" />
            <div className="min-w-0 flex-1 pr-24">
              <p className="ray-kicker">
                {CATEGORY_LABELS[idea.category]}
                {idea.campus ? ` · ${idea.campus.label}` : ""}
                {isEvent ? (
                  <>
                    {" · "}
                    <time dateTime={idea.eventAt}>{eventWhen(idea.eventAt!)}</time>
                  </>
                ) : null}
                {isEvent && idea.eventLocation ? ` · ${idea.eventLocation}` : ""}
                {idea.tags.map((tag) => (
                  <Link key={tag.slug} to={`/ideas?tag=${tag.slug}`}>
                    {` · #${tag.label}`}
                  </Link>
                ))}
              </p>
              <h1 className="ray-title">{idea.title}</h1>
              <p className="ray-summary">{idea.summary}</p>
            </div>
          </section>

          <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-7">
            <GuideMarkdown html={idea.html} />
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-[var(--color-text)]">Обговорення</h2>
            <p className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
              <Link to="/login" prefetch="intent" className="font-medium text-[var(--color-accent)] hover:underline">
                Увійдіть
              </Link>
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
              <Link
                to="/login"
                prefetch="intent"
                className="inline-flex rounded-[var(--radius-control)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] hover:bg-[var(--color-accent-strong)]"
              >
                Долучитися
              </Link>
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
