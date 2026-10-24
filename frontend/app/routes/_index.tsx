import { AboutPlatform, LANDING_FAQ } from "~/components/landing/about-platform";
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
import { getEvents, getIdeas, routeApi } from "~/lib/api.server";
import { toIdeaCard } from "~/lib/ideas";
import { seo } from "~/lib/seo";
import { compact, faqPage, webPage } from "~/lib/structured-data";
import type { Route } from "./+types/_index";

/** Три «гарячі» ідеї для тизера: публічні, не тестові, за активністю, потім за свіжістю. */
export async function loader({ request }: Route.LoaderArgs) {
  const [hotPage, eventsPage] = await routeApi(Promise.all([
    getIdeas(request, { sort: "hot", limit: 3 }),
    getEvents(request, new Date().toISOString()),
  ]));
  return {
    hot: hotPage.items.map(toIdeaCard),
    events: eventsPage.items.slice(0, 3).map(toIdeaCard),
  };
}

const TITLE = "Платформа ідей НаУКМА: стартапи, проєкти й події | Fantasm";
const DESCRIPTION =
  "Fantasm — платформа ідей Києво-Могилянської академії: публікуй стартап, дослідження чи подію, збирай голоси, обговорення й команду однодумців.";

export function meta() {
  return seo({
    title: TITLE,
    description: DESCRIPTION,
    path: "/",
    // organization і website seo() додає сам, у кожен граф.
    jsonLd: compact([
      webPage({ path: "/", name: TITLE, description: DESCRIPTION, breadcrumb: false }),
      faqPage(LANDING_FAQ),
    ]),
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
            <AboutPlatform />
          </main>
        </CurvedSheet>
        <CtaFooter />
      </div>
    </PageLoader>
  );
}
