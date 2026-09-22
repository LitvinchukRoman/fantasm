import type { Metadata } from "next";
import { getEvents } from "@/lib/api";
import { EmptyState } from "@/components/ui/empty-state";
import { IlloNoEvents } from "@/components/ui/illustrations";
import { EventsTimeline } from "@/components/events-timeline";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Події",
  description: "Найближчі події спільноти НаУКМА: ігри, лекції, зустрічі та воркшопи.",
  alternates: { canonical: "/events" },
};

export default async function EventsPage() {
  const events = (await getEvents()) ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-10">
      <header>
        <h1 className="text-h1">Найближчі події</h1>
        <p className="mt-1 text-[color:var(--ink-2)]">Приєднуйтесь офлайн і онлайн — від ігор до лекцій.</p>
      </header>

      {events.length === 0 ? (
        <EmptyState
          illustration={<IlloNoEvents />}
          title="Подій поки немає"
          description="Створіть подію — гру, лекцію чи зустріч — і зберіть учасників."
          actionHref="/ideas/new"
          actionLabel="Створити подію"
        />
      ) : (
        <EventsTimeline events={events} />
      )}
    </div>
  );
}
