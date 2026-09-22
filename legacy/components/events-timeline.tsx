import { Link } from "@/lib/link";
import { MapPin, ArrowRight } from "lucide-react";
import type { IdeaCard } from "@/lib/types";
import { Chip } from "@/components/ui/chip";
import { eventDate } from "@/lib/format";

/** Vertical timeline of upcoming events with date markers on a single rail. */
export function EventsTimeline({ events }: { events: IdeaCard[] }) {
  return (
    <ol className="relative ml-3 border-l border-[var(--line)]">
      {events.map((e) => (
        <li key={e.id} className="relative pb-6 pl-6 last:pb-0">
          <span className="absolute -left-[6.5px] top-1.5 size-3 rounded-full border-2 border-[var(--bg)] bg-[var(--accent)]" />
          <Link
            href={`/ideas/${e.slug}`}
            className="group block rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] p-4 transition-colors duration-[var(--dur-2)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="accent" className="tabnums">{e.eventAt ? eventDate(e.eventAt) : "Скоро"}</Chip>
              {e.campus && <Chip tone="seal">Могилянка</Chip>}
            </div>
            <h3 className="mt-2 font-semibold leading-snug transition-colors group-hover:text-[color:var(--accent-ink)]">
              {e.title}
            </h3>
            {e.eventLocation && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-[color:var(--ink-2)]">
                <MapPin className="size-3.5 shrink-0" /> {e.eventLocation}
              </p>
            )}
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--accent-ink)]">
              Деталі <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
