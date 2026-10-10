import { useMemo, useState } from "react";
import { data, Link, useFetcher, useRouteLoaderData } from "react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { GuideMarkdown } from "~/components/guides/markdown";
import { IdeasBackground } from "~/components/ideas/ideas-background";
import { IconArrowRight, IconCheck, IconFlag, IconLink } from "~/components/landing/icons";
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
import { UserAvatar } from "~/components/ui/user-avatar";
import { VerifiedSeal } from "~/components/ui/verified-seal";
import { CATEGORY_LABELS, eventWhen, type IdeaView } from "~/lib/ideas";
import { toIdeaView } from "~/lib/ideas";
import { isGeneratedHandle } from "~/lib/profile";
import {
  ApiError,
  createPost,
  decideParticipant,
  getIdea,
  getNextIdea,
  getParticipants,
  getProfile,
  getThread,
  participate,
  reportIdea,
  routeApi,
  vote,
} from "~/lib/api.server";
import type { AuthorPreview } from "~/lib/users.server";
import type { ForumPost } from "~/lib/forum";
import { toForumThread } from "~/lib/forum";
import { seo } from "~/lib/seo";
import {
  breadcrumbList,
  compact,
  discussionForumPosting,
  event,
  webPage,
} from "~/lib/structured-data";
import type { Route } from "./+types/idea";
import type { RootData } from "~/root";

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!params.slug) throw data("Not found", { status: 404 });
  const [rawIdea, rawThread, rawNext, participants] = await routeApi(Promise.all([
    getIdea(request, params.slug),
    getThread(request, params.slug),
    getNextIdea(request, params.slug),
    getParticipants(request, params.slug),
  ]));
  const idea = toIdeaView(rawIdea);
  const thread = toForumThread(rawThread);
  const next = rawNext ? { ...rawNext, summary: rawNext.summary ?? "" } : null;

  // Профілі автора ідеї й усіх, хто писав у гілці: клік по імені відкриває панель на місці.
  const handles = new Set<string>([idea.author.handle]);
  for (const participant of participants.items) handles.add(participant.handle);
  const walk = (posts: ForumPost[]) =>
    posts.forEach((post) => {
      if (!post.deleted) handles.add(post.author.handle);
      walk(post.replies);
    });
  walk(thread.posts);

  const profiles: Record<string, AuthorPreview> = {};
  await routeApi(Promise.all([...handles].map(async (handle) => {
    const profile = await getProfile(request, handle);
    profiles[handle] = {
      handle: profile.handle,
      name: profile.name,
      bio: profile.bio ?? "",
      faculty: profile.faculty,
      avatarUrl: profile.avatarUrl,
      verified: profile.verified ?? false,
      karma: profile.karma ?? 0,
      joinedAt: profile.joinedAt,
      ideasCount: profile.ideasCount ?? profile.ideas?.length ?? 0,
      ideas: (profile.ideas ?? []).slice(0, 3).map(({ slug, title }) => ({ slug, title })),
    };
  })));

  return {
    idea,
    thread,
    next,
    participants: participants.items,
    profiles,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  if (!params.slug) return data({ error: "Ідею не знайдено" }, { status: 404 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  try {
    if (intent === "vote") return data(await vote(request, params.slug, form.get("remove") === "true"));
    if (intent === "participate") return data(await participate(request, params.slug, String(form.get("state") || "JOINED"), String(form.get("role") || "") || undefined));
    if (intent === "leave") return data(await participate(request, params.slug));
    if (intent === "participant-decision") {
      const decision = String(form.get("decision"));
      if (decision !== "accept" && decision !== "decline") return data({ error: "Некоректне рішення" }, { status: 400 });
      return data(await decideParticipant(request, params.slug, String(form.get("handle")), decision));
    }
    if (intent === "post") return data(await createPost(request, params.slug, String(form.get("body") ?? ""), String(form.get("parentId") || "") || undefined), { status: 201 });
    if (intent === "report") {
      await reportIdea(request, params.slug, String(form.get("reason") ?? ""));
      return data({ ok: true });
    }
    return data({ error: "Невідома дія" }, { status: 400 });
  } catch (error) {
    if (error instanceof ApiError) return data(error.body, { status: error.status });
    throw error;
  }
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

function ParticipationControl({ joined, isEvent, size = "md" }: { joined: boolean; isEvent: boolean; size?: "md" | "sm" }) {
  const root = useRouteLoaderData<RootData>("root");
  const fetcher = useFetcher();
  if (!root?.currentUser) return <Button to="/login" variant="secondary" size={size}>{isEvent ? "Я піду" : "Долучитися"}</Button>;
  return (
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value={joined ? "leave" : "participate"} />
      {!joined && <input type="hidden" name="state" value="JOINED" />}
      <Button type="submit" variant="secondary" size={size} disabled={fetcher.state !== "idle"}>
        {joined ? "Не долучатися" : isEvent ? "Я піду" : "Долучитися"}
      </Button>
    </fetcher.Form>
  );
}

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** Чому ідею бачить лише автор. Для схваленої ідеї пояснювати нічого. */
const MODERATION_NOTES: Partial<Record<NonNullable<IdeaView["moderation"]>, { label: string; note: string }>> = {
  PENDING: {
    label: "на модерації",
    note: "Поки ідею бачите лише ви. Підтримка, заявки в команду й обговорення відкриються, щойно модератор її схвалить.",
  },
  HIDDEN: { label: "прихована", note: "Модератор сховав ідею, тому інші її зараз не бачать." },
  REJECTED: { label: "відхилена", note: "Модератор відхилив ідею, тому інші її не бачать." },
};

function ShareButton({ size = "md" }: { size?: "md" | "sm" }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href.split("#")[0]);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <Button variant="secondary" size={size} onClick={copy} aria-live="polite">
      {copied ? <IconCheck className="size-4" /> : <IconLink className="size-4" />}
      {copied ? "Посилання скопійовано" : "Поділитися"}
    </Button>
  );
}

/**
 * Автор не голосує за свою ідею й не долучається до неї (бекенд відповість 422), тож замість
 * цих кнопок у нього статус ідеї, посилання, щоб її поширити, і перехід до заявок у команду.
 */
function OwnerBar({ moderation, requests }: { moderation: IdeaView["moderation"]; requests: number }) {
  const status = moderation ? MODERATION_NOTES[moderation] : undefined;
  return (
    <>
      <span className="inline-flex items-center gap-2 rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-3.5 py-2 text-sm text-[var(--color-text)]">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--color-accent)]" />
        Ваша ідея
        {status && <span className="text-[var(--color-text-muted)]">· {status.label}</span>}
      </span>
      {!status && <ShareButton />}
      {requests > 0 && (
        <Button to="#komanda" variant="secondary">
          Заявки в команду <span className="tabular-nums opacity-70">{requests}</span>
        </Button>
      )}
      {status && <p className="basis-full max-w-xl text-sm text-[var(--color-text-muted)]">{status.note}</p>}
    </>
  );
}

/** Тиха дія в ряду кнопок; панель з причиною розгортається на всю ширину під рядом. */
function ReportControl() {
  const root = useRouteLoaderData<RootData>("root");
  const fetcher = useFetcher<{ ok?: boolean; error?: string }>();
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  if (!root?.currentUser) return null;
  const sent = Boolean(fetcher.data?.ok);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={sent}
        aria-expanded={open && !sent}
        aria-controls="idea-report"
        className="ml-auto inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-2 text-sm text-[var(--color-text-faint)] transition-colors duration-200 hover:text-[var(--color-text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] disabled:cursor-default disabled:hover:text-[var(--color-text-faint)]"
      >
        {sent ? <IconCheck className="size-4" /> : <IconFlag className="size-4" />}
        {sent ? "Скаргу надіслано" : "Поскаржитися"}
      </button>

      <AnimatePresence initial={false}>
        {open && !sent && (
          <motion.div
            id="idea-report"
            key="report"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: EASE_OUT }}
            className="-mt-3 basis-full overflow-hidden"
          >
            <fetcher.Form method="post" className="pt-4">
              <input type="hidden" name="intent" value="report" />
              <label htmlFor="report-reason" className="text-sm font-medium text-[var(--color-text-muted)]">
                Що не так з ідеєю?
              </label>
              <textarea
                id="report-reason"
                name="reason"
                required
                autoFocus
                rows={2}
                maxLength={500}
                placeholder="Спам, образи, чужа ідея…"
                className="mt-2 block w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[16px] text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-[border-color] duration-200 focus:border-[var(--color-accent)] focus:outline-none sm:text-sm"
              />
              {fetcher.data?.error && <p role="alert" className="mt-2 text-sm text-red-300">{fetcher.data.error}</p>}
              <div className="mt-3 flex items-center justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Скасувати</Button>
                <Button type="submit" size="sm" variant="secondary" disabled={fetcher.state !== "idle"}>
                  {fetcher.state === "idle" ? "Надіслати" : "Надсилаємо…"}
                </Button>
              </div>
            </fetcher.Form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ParticipantActions({ handle }: { handle: string }) {
  const fetcher = useFetcher();
  return (
    <fetcher.Form method="post" className="inline-flex gap-2">
      <input type="hidden" name="intent" value="participant-decision" />
      <input type="hidden" name="handle" value={handle} />
      <Button type="submit" name="decision" value="accept" size="sm" disabled={fetcher.state !== "idle"}>Прийняти</Button>
      <Button type="submit" name="decision" value="decline" size="sm" variant="secondary" disabled={fetcher.state !== "idle"}>Відхилити</Button>
    </fetcher.Form>
  );
}

export default function IdeaPage({ loaderData }: Route.ComponentProps) {
  const { idea, thread, next, participants, profiles } = loaderData;
  const isEvent = idea.category === "EVENT" && !!idea.eventAt;
  const root = useRouteLoaderData<RootData>("root");
  const isOwner = root?.currentUser?.handle === idea.author.handle;
  // Поки ідею не схвалили, бекенд не приймає ні голосів, ні дописів: гілку бачить лише автор.
  const live = !idea.moderation || idea.moderation === "APPROVED";
  const requests = isOwner && !isEvent ? participants.filter((p) => p.state === "JOINED" || p.state === "INTERESTED").length : 0;

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
                    <UserAvatar name={idea.author.name} src={profiles[idea.author.handle]?.avatarUrl} className="size-14 text-xl" />
                    <div className="min-w-0">
                      <AuthorLink
                        handle={idea.author.handle}
                        className="block font-medium text-[var(--color-text)] [overflow-wrap:anywhere] hover:underline"
                      >
                        {idea.author.name}
                      </AuthorLink>
                      {!isGeneratedHandle(idea.author.handle) && <span className="hud-label">@{idea.author.handle}</span>}
                    </div>
                    {idea.author.verified && <VerifiedSeal />}
                  </div>

                  <div
                    id={IDEA_ACTIONS_ID}
                    className="mt-8 flex flex-wrap items-center gap-3"
                  >
                    {isOwner ? (
                      <OwnerBar moderation={idea.moderation} requests={requests} />
                    ) : (
                      <>
                        <VoteControl score={idea.votes} voted={idea.viewer?.voted} />
                        <ParticipationControl joined={Boolean(idea.viewer?.participation)} isEvent={isEvent} />
                        <ReportControl />
                      </>
                    )}
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
                            {idea.visibility !== "PUBLIC" && (
                              <Chip
                                tone="strong"
                                title="Тільки для спільноти НаУКМА"
                              >
                                {idea.visibility}
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
                          {isOwner ? "Ви шукаєте людей на ролі:" : "Автор шукає людей на ролі:"}
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
                      ) : !isOwner ? (
                        "Ще нікого. Будь першим."
                      ) : !live ? (
                        "Заявки почнуть приходити після модерації."
                      ) : isEvent ? (
                        "Поки ніхто не зголосився. Поділіться посиланням на подію."
                      ) : (
                        "Поки ніхто не долучився. Коли хтось подасть заявку, вона зʼявиться тут, і ви вирішите, кого прийняти."
                      )}
                    </p>
                    {participants.length > 0 && (
                      <ul className="space-y-2">
                        {participants.map((participant) => (
                          <li key={participant.handle} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] p-3">
                            <span className="flex min-w-0 items-center gap-3">
                              <UserAvatar name={participant.name} src={profiles[participant.handle]?.avatarUrl} className="size-8 text-sm" />
                              <span className="min-w-0">
                                <AuthorLink handle={participant.handle} className="font-medium hover:underline">{participant.name}</AuthorLink>
                                <span className="ml-2 text-xs text-[var(--color-text-faint)]">{participant.role || participant.state}</span>
                              </span>
                            </span>
                            {idea.canEdit && (participant.state === "JOINED" || participant.state === "INTERESTED") && <ParticipantActions handle={participant.handle} />}
                          </li>
                        ))}
                      </ul>
                    )}
                    {!isOwner && <ParticipationControl joined={Boolean(idea.viewer?.participation)} isEvent={isEvent} />}
                  </div>
                </section>

                <section aria-labelledby="discussion">
                  <SectionLabel index="03" id="discussion">
                    Обговорення ·{" "}
                    <span className="tabular-nums">{thread.count}</span>
                  </SectionLabel>
                  <div className="mt-6">
                    <Forum
                      thread={thread}
                      authorHandle={idea.author.handle}
                      closed={live ? undefined : "Обговорення відкриється, щойно модератор схвалить ідею."}
                    />
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
        <IdeaDock comments={thread.count}>
          {isOwner ? (
            <>
              <span className="px-3 text-sm whitespace-nowrap text-[var(--color-text-muted)]">Ваша ідея</span>
              {requests > 0 ? (
                <Button to="#komanda" variant="secondary" size="sm">
                  Заявки <span className="tabular-nums opacity-70">{requests}</span>
                </Button>
              ) : (
                live && <ShareButton size="sm" />
              )}
            </>
          ) : (
            <>
              <VoteControl score={idea.votes} voted={idea.viewer?.voted} size="sm" />
              <ParticipationControl joined={Boolean(idea.viewer?.participation)} isEvent={isEvent} size="sm" />
            </>
          )}
        </IdeaDock>
      </div>
    </AuthorPopoverProvider>
  );
}
