import { CalendarDays, MapPin, Users, CalendarPlus } from "lucide-react";
import type { IdeaDetail } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { JoinButton } from "@/components/join-button";
import { Countdown } from "@/components/countdown";
import { eventDate } from "@/lib/format";

function googleCalendarUrl(idea: IdeaDetail): string {
  const start = new Date(idea.eventAt!);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: idea.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: idea.summary ?? "",
    ...(idea.eventLocation ? { location: idea.eventLocation } : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Event details + countdown + RSVP + calendar export, shown for EVENT ideas. */
export function EventBlock({ idea }: { idea: IdeaDetail }) {
  if (!idea.eventAt) return null;
  const rsvped = idea.viewerParticipation != null;

  return (
    <Card level={2} className="p-5">
      <h2 className="text-h3 mb-4">Подія</h2>

      <Countdown to={idea.eventAt} />

      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-center gap-2">
          <CalendarDays className="size-4 text-[color:var(--accent-ink)]" />
          {eventDate(idea.eventAt)}
        </li>
        {idea.eventLocation && (
          <li className="flex items-center gap-2">
            <MapPin className="size-4 text-[color:var(--accent-ink)]" /> {idea.eventLocation}
          </li>
        )}
        {idea.capacity != null && (
          <li className="flex items-center gap-2 tabnums">
            <Users className="size-4 text-[color:var(--accent-ink)]" />
            {idea.participantsCount} / {idea.capacity} учасників
          </li>
        )}
      </ul>

      <div className="mt-5 flex flex-wrap gap-3">
        <JoinButton ideaId={idea.id} initialJoined={rsvped} label="Піду" joinedLabel="Ви йдете" />
        <a
          href={googleCalendarUrl(idea)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface-1)] px-5 text-sm font-medium transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
        >
          <CalendarPlus className="size-4" /> В календар
        </a>
      </div>
    </Card>
  );
}
