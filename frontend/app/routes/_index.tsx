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
import { seo } from "~/lib/seo";
import { organization, website } from "~/lib/structured-data";

export function meta() {
  return seo({
    title: "Fantasm, платформа ідей Києво-Могилянської академії",
    description:
      "Публікуй стартап, дослідження, подію чи книжковий клуб. Спільнота НаУКМА голосує, обговорює і формує команди.",
    path: "/",
    jsonLd: [website(), organization()],
  });
}

export default function Index() {
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
            <HotFeedTeaser />
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
