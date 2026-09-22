import { Link } from "@/lib/link";
import { MessageCircle, Users, CalendarDays, MapPin } from "lucide-react";
import type { IdeaCard as IdeaCardType } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Cover } from "@/components/ui/cover";
import { Avatar } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { VoteButton } from "@/components/vote-button";
import { MomentumMeter } from "@/components/momentum-meter";
import { CATEGORY_LABELS, cn } from "@/lib/utils";
import { eventDate, timeAgo } from "@/lib/format";

/**
 * Feed card. Solid surface, hairline border, hierarchy title > summary > meta.
 * `featured` gives it a deterministic cover for the editorial 60/40 grid.
 * No lift/shadow on hover — only a restrained border/tone step.
 */
export function IdeaCard({ idea, featured = false }: { idea: IdeaCardType; featured?: boolean }) {
  const isEvent = idea.category === "EVENT" && idea.eventAt;
  const category = CATEGORY_LABELS[idea.category] ?? idea.category;

  const meta = (
    <div className="flex items-center justify-between gap-2">
      <Link href={`/u/${idea.author.handle}`} className="flex min-w-0 items-center gap-2">
        <Avatar name={idea.author.name} src={idea.author.avatarUrl} size="sm" />
        <span className="truncate text-sm font-medium">{idea.author.name}</span>
        {idea.author.verifiedMohylian && <VerifiedBadge faculty={idea.author.faculty} size={16} />}
      </Link>
      <div className="flex shrink-0 items-center gap-3 text-xs text-[color:var(--ink-3)]">
        <span className="inline-flex items-center gap-1 tabnums">
          <MessageCircle className="size-3.5" /> {idea.commentsCount}
        </span>
        <span className="inline-flex items-center gap-1 tabnums">
          <Users className="size-3.5" /> {idea.participantsCount}
        </span>
        <span className="hidden @sm:inline">{timeAgo(idea.createdAt)}</span>
      </div>
    </div>
  );

  if (featured) {
    return (
      <Card interactive className="group flex flex-col overflow-hidden">
        <Cover seed={idea.slug} className="h-40 p-4">
          <div className="flex items-start justify-between">
            <Chip className="bg-black/25 text-white backdrop-blur-sm">{category}</Chip>
            {idea.campus && <Chip tone="seal">Могилянка</Chip>}
          </div>
        </Cover>
        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex items-start gap-4">
            <VoteButton ideaId={idea.id} initialScore={idea.votesScore} initialVoted={idea.viewerHasVoted} />
            <Link href={`/ideas/${idea.slug}`} className="min-w-0 flex-1">
              <h3 className="text-h3 transition-colors group-hover:text-[color:var(--accent-ink)]">{idea.title}</h3>
              <p className="mt-1.5 line-clamp-2 text-[color:var(--ink-2)]">{idea.summary}</p>
            </Link>
          </div>
          <MomentumMeter idea={idea} />
          <div className="mt-auto border-t border-[var(--line)] pt-3">{meta}</div>
        </div>
      </Card>
    );
  }

  return (
    <Card
      interactive
      className={cn("@container group flex gap-4 p-4 sm:p-5", idea.campus && "border-l-2 border-l-[var(--seal)]")}
    >
      <VoteButton ideaId={idea.id} initialScore={idea.votesScore} initialVoted={idea.viewerHasVoted} />

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{category}</Chip>
          {idea.campus && <Chip tone="seal">Могилянка</Chip>}
          {idea.visibility === "UKMA_ONLY" && <Chip>лише НаУКМА</Chip>}
        </div>

        <Link href={`/ideas/${idea.slug}`} className="block">
          <h3 className="text-[17px] font-semibold leading-snug transition-colors group-hover:text-[color:var(--accent-ink)]">
            {idea.title}
          </h3>
          <p className="mt-1 line-clamp-2 text-sm text-[color:var(--ink-2)]">{idea.summary}</p>
        </Link>

        {isEvent && (
          <div className="flex flex-wrap gap-3 text-xs text-[color:var(--ink-2)]">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" /> {eventDate(idea.eventAt!)}
            </span>
            {idea.eventLocation && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" /> {idea.eventLocation}
              </span>
            )}
          </div>
        )}

        {idea.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {idea.tags.slice(0, 4).map((t) => (
              <Link key={t.slug} href={`/ideas?tag=${t.slug}`}>
                <Chip className="font-mono">#{t.label}</Chip>
              </Link>
            ))}
          </div>
        )}

        {meta}
      </div>
    </Card>
  );
}
