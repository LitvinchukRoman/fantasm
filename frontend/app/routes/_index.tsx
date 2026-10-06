import { CtaFooter } from "~/components/landing/cta-footer";
import { CurvedSheet } from "~/components/landing/curved-sheet";
import { HeroBackground } from "~/components/landing/hero-background";
import { EventsTeaser } from "~/components/landing/events-teaser";
import { Hero, HeroIntro } from "~/components/landing/hero";
import { HotFeedTeaser } from "~/components/landing/hot-feed-teaser";
import { HowItWorks } from "~/components/landing/how-it-works";
import { IdeaKinds } from "~/components/landing/idea-kinds";
import { MohylianPerks } from "~/components/landing/mohylian-perks";
import { Nav } from "~/components/landing/nav";
import { PageLoader } from "~/components/ui/page-loader";
import { getIdeas, toCard } from "~/lib/ideas.server";
import { seo } from "~/lib/seo";
import { webPage } from "~/lib/structured-data";
import type { Route } from "./+types/_index";

/** Три «гарячі» ідеї для тизера: публічні, не тестові, за активністю, потім за свіжістю. */
export function loader() {
  const hot = getIdeas()
    .filter((idea) => idea.visibility === "PUBLIC" && !idea.fixture)
    .sort(
      (a, b) =>
        b.votes + b.comments + b.participants - (a.votes + a.comments + a.participants) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )
    .slice(0, 3)
    .map(toCard);
  // Найближчі події для тизера. Тестові (fixture) події є лише в dev: `getIdeas()` додає їх лише при `ideasSeedEnabled()`,
  // тож на проді без справжніх подій тизер показує порожній стан.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const events = getIdeas()
    .filter((idea) => idea.category === "EVENT" && idea.eventAt && Date.parse(idea.eventAt) >= startOfToday.getTime())
    .sort((a, b) => Date.parse(a.eventAt!) - Date.parse(b.eventAt!))
    .slice(0, 3)
    .map(toCard);
  return { hot, events };
}

export function meta() {
  return seo({
    title: "Fantasm, платформа ідей Києво-Могилянської академії",
    description:
      "Публікуй стартап, дослідження, подію чи книжковий клуб. Спільнота НаУКМА голосує, обговорює і формує команди.",
    path: "/",
    // organization і website seo() додає сам, у кожен граф.
    jsonLd: [
      webPage({
        path: "/",
        name: "Fantasm, платформа ідей Києво-Могилянської академії",
        description:
          "Публікуй стартап, дослідження, подію чи книжковий клуб. Спільнота НаУКМА голосує, обговорює і формує команди.",
        breadcrumb: false,
      }),
    ],
  });
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return (
    <PageLoader>
      <div>
        {/* h-lvh: найбільший в'юпорт. Висота не стрибає, коли на мобільному згортається адресний рядок. */}
        <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-lvh">
          <HeroBackground />
        </div>
        <Nav />
        <div className="relative z-10 h-dvh">
          <Hero />
        </div>
        <CurvedSheet>
          <HeroIntro />
          <main>
            <HowItWorks />
            <HotFeedTeaser ideas={loaderData.hot} />
            <MohylianPerks />
            <IdeaKinds />
            <EventsTeaser events={loaderData.events} />
          </main>
        </CurvedSheet>
        <CtaFooter />
      </div>
    </PageLoader>
  );
}
