import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, Sparkles } from "lucide-react";
import { getUserProfile } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { IdeaCard } from "@/components/idea-card";
import { EmptyState } from "@/components/ui/empty-state";
import { IlloEmptyFeed } from "@/components/ui/illustrations";
import { eventDate } from "@/lib/format";

export const revalidate = 120;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getUserProfile(handle);
  if (!profile) return { title: "Профіль не знайдено" };
  return {
    title: profile.name,
    description: profile.bio ?? `Ідеї та проєкти ${profile.name} на NaUKMA Ideas.`,
    alternates: { canonical: `/u/${profile.handle}` },
  };
}

export default async function ProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = await getUserProfile(handle);
  if (!profile) notFound();

  return (
    <div className="space-y-6 pb-10">
      <Card level={2} className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
        <Avatar name={profile.name} src={profile.avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <h1 className="text-h1">{profile.name}</h1>
            {profile.verifiedMohylian && <VerifiedBadge faculty={profile.faculty} showLabel />}
          </div>
          <p className="text-[color:var(--ink-3)]">@{profile.handle}</p>
          {profile.bio && <p className="mt-2 text-[color:var(--ink-2)]">{profile.bio}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-sm text-[color:var(--ink-3)] sm:justify-start">
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-4 text-[color:var(--accent-ink)]" /> {profile.karma} карми
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" /> З нами з {eventDate(profile.createdAt)}
            </span>
          </div>
        </div>
      </Card>

      <h2 className="text-h2">Ідеї</h2>
      {profile.ideas.length === 0 ? (
        <EmptyState illustration={<IlloEmptyFeed />} title="Ще немає ідей" description="Тут зʼявляться опубліковані ідеї." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {profile.ideas.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      )}
    </div>
  );
}
