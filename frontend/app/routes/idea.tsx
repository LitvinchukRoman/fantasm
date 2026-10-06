import { useMemo } from "react";
import { data, Link } from "react-router";
import { GuideMarkdown } from "~/components/guides/markdown";
import { IdeasBackground } from "~/components/ideas/ideas-background";
import { IconArrowRight } from "~/components/landing/icons";
import { Nav } from "~/components/landing/nav";
import { AuthorLink, AuthorPopoverProvider } from "~/components/idea/author-popover";
import { Forum } from "~/components/idea/forum";
import { IDEA_ACTIONS_ID, IdeaDock } from "~/components/idea/idea-dock";
import { NextIdea } from "~/components/idea/next-idea";
import { PageIndex, type IndexItem } from "~/components/idea/page-index";
import { VoteControl } from "~/components/idea/vote-control";
import { Button } from "~/components/ui/button";
import { Chip } from "~/components/ui/chip";
import { HudLabel } from "~/components/ui/hud-label";
import { Marquee } from "~/components/ui/marquee";
import { MetaGrid } from "~/components/ui/meta-grid";
import { RelativeTime } from "~/components/ui/relative-time";
import { SectionLabel } from "~/components/ui/section-label";
import { SiteFooter } from "~/components/ui/site-footer";
import { VerifiedSeal } from "~/components/ui/verified-seal";
import { getThread } from "~/lib/forum.server";
import { CATEGORY_LABELS, eventWhen } from "~/lib/ideas";
import {
  getIdea,
  getIdeas,
  getNextIdea,
  ideasSeedEnabled,
  toCard,
  toView,
} from "~/lib/ideas.server";
import { getAuthorPreview, type AuthorPreview } from "~/lib/users.server";
import type { ForumPost } from "~/lib/forum";
import { seo } from "~/lib/seo";
import {
  breadcrumbList,
  compact,
  discussionForumPosting,
  event,
  webPage,
} from "~/lib/structured-data";
import type { Route } from "./+types/idea";

export function loader({ params }: Route.LoaderArgs) {
  const idea = getIdea(params.slug);
  if (!idea) throw data("Not found", { status: 404 });
  const thread = getThread(idea.slug, ideasSeedEnabled());

  // Профілі автора ідеї й усіх, хто писав у гілці: клік по імені відкриває панель на місці.
  const handles = new Set<string>([idea.author.handle]);
  const walk = (posts: ForumPost[]) =>
    posts.forEach((post) => {
      if (!post.deleted) handles.add(post.author.handle);
      walk(post.replies);
    });
  walk(thread.posts);

  const cards = getIdeas().map(toCard);
  const profiles: Record<string, AuthorPreview> = {};
  for (const handle of handles) {
    const preview = getAuthorPreview(handle, cards);
    if (preview) profiles[handle] = preview;
  }

  return {
    idea: toView(idea),
    thread,
    next: getNextIdea(idea.slug),
    profiles,
  };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { idea, thread } = data;
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
      webPage({
        path,
        name: idea.title,
        description: idea.summary,
        datePublished: idea.createdAt,
        dateModified: idea.updatedAt,
      }),
      breadcrumbList([
        { name: "Головна", path: "/" },
        { name: "Ідеї", path: "/ideas" },
        { name: idea.title, path },
      ]),
      event(idea),
      discussionForumPosting(idea, thread),
    ]),
  });
}

/** Крихти `ГОЛОВНА / ІДЕЇ / SLUG` і кнопка назад: ті самі, що в JSON-LD BreadcrumbList. */
function Crumbs({ slug }: { slug: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <nav
        aria-label="Хлібні крихти"
        className="hud-label flex min-w-0 flex-wrap items-center gap-x-2"
      >
        <Link
          to="/"
          prefetch="intent"
          className="transition-colors hover:text-[var(--color-text)]"
        >
          Головна
        </Link>
        <span aria-hidden="true">/</span>
        <Link
          to="/ideas"
          prefetch="intent"
          className="transition-colors hover:text-[var(--color-text)]"
        >
          Ідеї
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate text-[var(--color-text-muted)]">{slug}</span>
      </nav>
      <Button to="/ideas" variant="secondary" size="sm" className="shrink-0">
        <IconArrowRight className="size-4 rotate-180" />
        До стрічки
      </Button>
    </div>
  );
}

function Stagger({
  step,
  className,
  children,
}: {
  step: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={["animate-fade-up", className].filter(Boolean).join(" ")}
      style={{ "--reveal-delay": `${step * 70}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

export default function IdeaPage({ loaderData }: Route.ComponentProps) {
  const { idea, thread, next, profiles } = loaderData;
  const isEvent = idea.category === "EVENT" && !!idea.eventAt;

  const index = useMemo<IndexItem[]>(() => {
    const parts = idea.toc
      .filter(
        (item) =>
          item.depth === 2 &&
          item.text.trim().toLowerCase() !== idea.title.trim().toLowerCase(),
      )
      .slice(0, 6);
    return [
      { id: "opys", label: "Про ідею", index: "01" },
      ...parts.map((item) => ({ id: item.id, label: item.text })),
      { id: "komanda", label: isEvent ? "Учасники" : "Команда", index: "02" },
      { id: "discussion", label: "Обговорення", index: "03" },
    ];
  }, [idea.toc, idea.title, isEvent]);

  return (
    <AuthorPopoverProvider profiles={profiles} scope={idea.slug}>
      <div className="min-h-dvh">
        <IdeasBackground interactive={false} />
        <Nav forceSolid />
        <main className="relative z-10 mx-auto max-w-6xl px-5 pt-24 pb-28 sm:px-8">
          <article>
            <header>
              <Stagger step={0}>
                <Crumbs slug={idea.slug} />
              </Stagger>

              <Stagger step={1}>
                <h1 className="display-entity mt-8 text-[clamp(2.25rem,7vw,4.5rem)]">
                  {idea.title}
                </h1>
              </Stagger>

              <div className="mt-10 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
                <Stagger step={2}>
                  <HudLabel as="p">Про ідею</HudLabel>
                  <p className="mt-4 max-w-xl text-lg leading-relaxed text-[var(--color-text-muted)]">
                    {idea.summary}
                  </p>

                  <div className="mt-8 flex items-center gap-4">
                    <span
                      aria-hidden="true"
                      className="grid size-14 shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] text-xl text-[var(--color-text)]"
                    >
                      {idea.author.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <AuthorLink
                        handle={idea.author.handle}
                        className="block font-medium text-[var(--color-text)] [overflow-wrap:anywhere] hover:underline"
                      >
                        {idea.author.name}
                      </AuthorLink>
                      <span className="hud-label">@{idea.author.handle}</span>
                    </div>
                    {idea.author.verified && <VerifiedSeal />}
                  </div>

                  <div
                    id={IDEA_ACTIONS_ID}
                    className="mt-8 flex flex-wrap items-center gap-3"
                  >
                    <VoteControl score={idea.votes} />
                    <Button to="/login" variant="secondary">
                      {isEvent ? "Я піду" : "Долучитися"}
                    </Button>
                  </div>
                </Stagger>

                <Stagger step={3}>
                  <MetaGrid
                    items={[
                      {
                        label: "Тип",
                        value: (
                          <span className="flex flex-wrap gap-2">
                            <Chip>{CATEGORY_LABELS[idea.category]}</Chip>
                            {idea.visibility === "UKMA_ONLY" && (
                              <Chip
                                tone="strong"
                                title="Тільки для спільноти НаУКМА"
                              >
                                UKMA_ONLY
                              </Chip>
                            )}
                          </span>
                        ),
                      },
                      { label: "Кампус", value: idea.campus?.label },
                      {
                        label: "Коли",
                        value: isEvent ? (
                          <time dateTime={idea.eventAt}>
                            {eventWhen(idea.eventAt!)}
                          </time>
                        ) : null,
                      },
                      {
                        label: "Де",
                        value: isEvent ? idea.eventLocation : null,
                      },
                      {
                        label: "Створено",
                        value: <RelativeTime iso={idea.createdAt} />,
                      },
                      {
                        label: "Теги",
                        value: idea.tags.length ? (
                          <span className="flex flex-wrap gap-2">
                            {idea.tags.map((tag) => (
                              <Link
                                key={tag.slug}
                                to={`/ideas?tag=${tag.slug}`}
                                prefetch="intent"
                              >
                                <Chip>#{tag.label}</Chip>
                              </Link>
                            ))}
                          </span>
                        ) : null,
                      },
                      {
                        label: "Шукають",
                        value:
                          !isEvent && idea.needsRoles?.length ? (
                            <span className="flex flex-wrap gap-2">
                              {idea.needsRoles.map((role) => (
                                <Chip key={role} tone="accent">
                                  {role}
                                </Chip>
                              ))}
                            </span>
                          ) : null,
                      },
                      {
                        label: "Активність",
                        value: (
                          <span className="tabular-nums">
                            {idea.votes} голосів · {thread.count} коментарів ·{" "}
                            {idea.participants} учасників
                          </span>
                        ),
                      },
                    ]}
                  />
                </Stagger>
              </div>
            </header>

            <Stagger step={4} className="mt-14">
              <Marquee text={idea.title} />
            </Stagger>

            <div className="mt-14 grid gap-12 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
              <aside className="lg:sticky lg:top-28 lg:self-start">
                <PageIndex items={index} />
              </aside>

              <div className="min-w-0 space-y-20">
                <section aria-labelledby="opys">
                  <SectionLabel index="01" id="opys">
                    Про ідею
                  </SectionLabel>
                  <div className="mt-6">
                    <GuideMarkdown html={idea.html} />
                  </div>
                </section>

                <section aria-labelledby="komanda">
                  <SectionLabel index="02" id="komanda">
                    {isEvent ? "Учасники" : "Команда"}
                  </SectionLabel>
                  <div className="mt-6 max-w-xl space-y-4">
                    {!isEvent && idea.needsRoles?.length ? (
                      <>
                        <p className="text-[var(--color-text-muted)]">
                          Автор шукає людей на ролі:
                        </p>
                        <p className="flex flex-wrap gap-2">
                          {idea.needsRoles.map((role) => (
                            <Chip key={role} tone="accent">
                              {role}
                            </Chip>
                          ))}
                        </p>
                      </>
                    ) : null}
                    <p className="text-[var(--color-text-muted)]">
                      {idea.participants > 0 ? (
                        <>
                          Долучилися:{" "}
                          <span className="tabular-nums text-[var(--color-text)]">
                            {idea.participants}
                          </span>
                        </>
                      ) : (
                        "Ще нікого. Будь першим."
                      )}
                    </p>
                    <Button to="/login" variant="secondary" arrow>
                      {isEvent ? "Я піду" : "Долучитися"}
                    </Button>
                  </div>
                </section>

                <section aria-labelledby="discussion">
                  <SectionLabel index="03" id="discussion">
                    Обговорення ·{" "}
                    <span className="tabular-nums">{thread.count}</span>
                  </SectionLabel>
                  <div className="mt-6">
                    <Forum thread={thread} authorHandle={idea.author.handle} />
                  </div>
                </section>
              </div>
            </div>
          </article>

          {next && <NextIdea idea={next} />}
        </main>

        <div className="relative z-10">
          <SiteFooter />
        </div>
        <IdeaDock
          votes={idea.votes}
          comments={thread.count}
          isEvent={isEvent}
        />
      </div>
    </AuthorPopoverProvider>
  );
}
