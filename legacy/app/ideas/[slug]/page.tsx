import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Link } from "@/lib/link";
import { Users } from "lucide-react";
import { getIdea, getComments } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Avatar } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { VoteButton } from "@/components/vote-button";
import { JoinButton } from "@/components/join-button";
import { EventBlock } from "@/components/event-block";
import { ReportButton } from "@/components/report-button";
import { CommentThread } from "@/components/comment-thread";
import { MomentumMeter } from "@/components/momentum-meter";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/utils";
import { eventDate, timeAgo } from "@/lib/format";
import type { Comment } from "@/lib/types";

export const revalidate = 60;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ideas.naukma.com";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const idea = await getIdea(slug);
  if (!idea) return { title: "Ідею не знайдено" };

  const noindex = idea.visibility === "UKMA_ONLY";
  return {
    title: idea.title,
    description: idea.summary,
    alternates: { canonical: `/ideas/${idea.slug}` },
    robots: noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      title: idea.title,
      description: idea.summary,
      url: `${siteUrl}/ideas/${idea.slug}`,
      type: "article",
    },
  };
}

export default async function IdeaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const idea = await getIdea(slug);
  if (!idea) notFound();

  const comments: Comment[] = (await getComments(idea.id)) ?? [];
  const isEvent = idea.category === "EVENT" && !!idea.eventAt;

  return (
    <article className="space-y-6 pb-24 sm:pb-10">
      <JsonLd data={buildJsonLd(idea, isEvent)} />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card level={1} className="p-5 sm:p-7">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Chip>{CATEGORY_LABELS[idea.category] ?? idea.category}</Chip>
              <Chip>{STATUS_LABELS[idea.status] ?? idea.status}</Chip>
              {idea.campus && <Chip tone="seal">Могилянка</Chip>}
              {idea.visibility === "UKMA_ONLY" && <Chip>лише НаУКМА</Chip>}
            </div>

            <div className="flex items-start gap-4">
              <VoteButton ideaId={idea.id} initialScore={idea.votesScore} initialVoted={idea.viewerHasVoted} />
              <div className="min-w-0 flex-1">
                <h1 className="text-h1">{idea.title}</h1>
                <p className="mt-2 text-lg text-[color:var(--ink-2)]">{idea.summary}</p>
              </div>
            </div>

            <div className="mt-4 max-w-sm">
              <MomentumMeter idea={idea} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-4 text-sm">
              <Link href={`/u/${idea.author.handle}`} className="flex items-center gap-2">
                <Avatar name={idea.author.name} src={idea.author.avatarUrl} size="sm" />
                <span className="font-medium">{idea.author.name}</span>
                {idea.author.verifiedMohylian && <VerifiedBadge faculty={idea.author.faculty} size={16} />}
              </Link>
              <span className="text-[color:var(--ink-3)]">· {timeAgo(idea.createdAt)}</span>
              {isEvent && <span className="text-[color:var(--ink-3)]">· {eventDate(idea.eventAt!)}</span>}
              <div className="ml-auto flex items-center gap-3">
                {idea.viewerCanEdit && (
                  <Link href={`/ideas/new?edit=${idea.id}`} className="text-xs font-medium text-[color:var(--accent-ink)] hover:underline">
                    Редагувати
                  </Link>
                )}
                <ReportButton ideaId={idea.id} />
              </div>
            </div>
          </Card>

          <Card level={1} className="p-5 sm:p-7">
            <Markdown>{idea.bodyMd}</Markdown>
          </Card>

          {idea.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {idea.tags.map((t) => (
                <Link key={t.slug} href={`/ideas?tag=${t.slug}`}>
                  <Chip className="font-mono">#{t.label}</Chip>
                </Link>
              ))}
            </div>
          )}

          <CommentThread ideaId={idea.id} initial={comments} />
        </div>

        {/* Sidebar — sticky on desktop */}
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          {isEvent && <EventBlock idea={idea} />}

          {!isEvent && (
            <Card level={2} className="space-y-4 p-5">
              <h2 className="text-h3">Команда</h2>
              {idea.needsRoles && (
                <p className="text-sm text-[color:var(--ink-2)]">
                  Шукають: <span className="text-[color:var(--ink)]">{idea.needsRoles}</span>
                </p>
              )}
              <JoinButton ideaId={idea.id} initialJoined={idea.viewerParticipation != null} />
            </Card>
          )}

          <Card level={1} className="p-5">
            <h3 className="mb-3 flex items-center gap-2 font-semibold">
              <Users className="size-4" /> Учасники · <span className="tabnums">{idea.participantsCount}</span>
            </h3>
            {idea.participants.length === 0 ? (
              <p className="text-sm text-[color:var(--ink-3)]">Ще нікого. Будьте першим!</p>
            ) : (
              <ul className="space-y-2">
                {idea.participants.map((p) => (
                  <li key={p.id} className="flex items-center gap-2">
                    <Avatar name={p.user.name} src={p.user.avatarUrl} size="sm" />
                    <Link href={`/u/${p.user.handle}`} className="truncate text-sm font-medium">
                      {p.user.name}
                    </Link>
                    {p.user.verifiedMohylian && <VerifiedBadge faculty={p.user.faculty} size={16} />}
                    {p.role && <span className="ml-auto text-xs text-[color:var(--ink-3)]">{p.role}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>

      {/* Mobile sticky action bar */}
      {!isEvent && (
        <div className="chrome fixed inset-x-3 bottom-20 z-30 flex items-center gap-3 rounded-2xl px-4 py-3 sm:hidden">
          <span className="text-sm text-[color:var(--ink-2)]">Долучитися до ідеї?</span>
          <div className="ml-auto">
            <JoinButton ideaId={idea.id} initialJoined={idea.viewerParticipation != null} />
          </div>
        </div>
      )}
    </article>
  );
}

function buildJsonLd(idea: Awaited<ReturnType<typeof getIdea>>, isEvent: boolean): Record<string, unknown> {
  if (!idea) return {};
  if (isEvent && idea.eventAt) {
    return {
      "@context": "https://schema.org",
      "@type": "Event",
      name: idea.title,
      description: idea.summary,
      startDate: idea.eventAt,
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      location: idea.eventLocation ? { "@type": "Place", name: idea.eventLocation } : undefined,
      organizer: { "@type": "Person", name: idea.author.name },
    };
  }
  return {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    headline: idea.title,
    articleBody: idea.summary,
    datePublished: idea.createdAt,
    author: { "@type": "Person", name: idea.author.name },
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: idea.votesScore },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: idea.commentsCount },
    ],
  };
}
