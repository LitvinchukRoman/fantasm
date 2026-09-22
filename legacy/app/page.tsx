import { Link } from "@/lib/link";
import { Flame, ArrowRight } from "lucide-react";
import { getFeed, getEvents } from "@/lib/api";
import { IdeaCard } from "@/components/idea-card";
import { EmptyState } from "@/components/ui/empty-state";
import { IlloEmptyFeed, IlloNoEvents } from "@/components/ui/illustrations";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { MohylianPerks } from "@/components/home/mohylian-perks";
import { CampusTeaser } from "@/components/home/campus-teaser";
import { Manifesto } from "@/components/home/manifesto";
import { EventsTimeline } from "@/components/events-timeline";

export const revalidate = 60;

export default async function HomePage() {
  const [hot, recent, events] = await Promise.all([
    getFeed({ sort: "HOT", size: 7 }),
    getFeed({ sort: "NEW", size: 50 }),
    getEvents(),
  ]);

  const hotItems = hot?.items ?? [];
  const recentItems = recent?.items ?? [];
  const eventList = events ?? [];

  // Live-ish stats derived from what the API already returns (no stats endpoint).
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const stats = {
    ideas: recentItems.length,
    teams: recentItems.filter((i) => i.status === "TEAM_FORMING" || i.participantsCount > 0).length,
    events: eventList.length,
  };

  return (
    <div className="space-y-20 pb-10 sm:space-y-28">
      <Hero stats={stats} />

      <HowItWorks />

      {/* Hot now — editorial 60/40 grid: first card featured. */}
      <section className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-h2 flex items-center gap-2">
            <Flame className="size-6 text-[color:var(--accent-ink)]" /> Гарячі зараз
          </h2>
          <Link
            href="/ideas"
            className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--accent-ink)] hover:underline"
          >
            Усі ідеї <ArrowRight className="size-4" />
          </Link>
        </div>

        {hotItems.length === 0 ? (
          <EmptyState
            illustration={<IlloEmptyFeed />}
            title="Тут з'явиться перша ідея"
            description="Станьте першим, хто поділиться ідеєю зі спільнотою."
            actionHref="/ideas/new"
            actionLabel="Запропонувати ідею"
          />
        ) : (
          <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
            <IdeaCard idea={hotItems[0]} featured />
            <div className="grid gap-4">
              {hotItems.slice(1, 4).map((idea) => (
                <IdeaCard key={idea.id} idea={idea} />
              ))}
            </div>
          </div>
        )}
      </section>

      <MohylianPerks />

      <CampusTeaser />

      {/* Upcoming events — timeline */}
      <section className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-h2">Найближчі події</h2>
          <Link
            href="/events"
            className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--accent-ink)] hover:underline"
          >
            Усі події <ArrowRight className="size-4" />
          </Link>
        </div>
        {eventList.length === 0 ? (
          <EmptyState
            illustration={<IlloNoEvents />}
            title="Подій поки немає"
            description="Створіть подію — гру, лекцію чи зустріч — і зберіть учасників."
            actionHref="/ideas/new"
            actionLabel="Створити подію"
          />
        ) : (
          <EventsTimeline events={eventList.slice(0, 5)} />
        )}
      </section>

      <Manifesto />
    </div>
  );
}
