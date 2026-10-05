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
  return { hot };
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
        <div className="pointer-events-none fixed inset-0 z-0">
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
            <EventsTeaser />
          </main>
        </CurvedSheet>
        <CtaFooter />
      </div>
    </PageLoader>
  );
}
