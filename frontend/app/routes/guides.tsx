import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { ArticlesBento } from "~/components/articles/bento";
import { HubIndex } from "~/components/articles/hub-index";
import { IdeasBackground } from "~/components/ideas/ideas-background";
import { Nav } from "~/components/landing/nav";
import { getArticleItems } from "~/lib/articles.server";
import { HUB_SLUGS, HUBS, getArticles, getHub } from "~/lib/content.server";
import { seo } from "~/lib/seo";
import { breadcrumbList, collectionPage, itemList } from "~/lib/structured-data";
import type { Route } from "./+types/guides";

const TITLE = "Гайди для студентів: стартапи, ігри та кампус";
const DESCRIPTION =
  "Практичні гайди Fantasm: як запустити студентський стартап, провести ігри та івенти, знайти команду й можливості в кампусі НаУКМА.";

// Статті читаються з content/ на білді: у пререндереному HTML сторінки секція вже заповнена.
export function loader() {
  return {
    articles: getArticleItems(),
    hubs: HUB_SLUGS.map((hub) => {
      const pillar = getHub(hub);
      return {
        hub,
        title: pillar?.frontmatter.title ?? HUBS[hub].label,
        description: pillar?.frontmatter.description ?? HUBS[hub].tagline,
        articles: getArticles(hub).map((article) => ({
          title: article.frontmatter.title,
          path: article.path,
          minutes: article.readingMinutes,
        })),
      };
    }),
  };
}

export function meta({ data }: Route.MetaArgs) {
  return seo({
    title: TITLE,
    description: DESCRIPTION,
    path: "/guides",
    jsonLd: [
      collectionPage({ name: TITLE, description: DESCRIPTION, path: "/guides" }),
      breadcrumbList([
        { name: "Головна", path: "/" },
        { name: "Гайди", path: "/guides" },
      ]),
      ...(data ? [itemList(data.hubs.map((hub) => ({ name: hub.title, path: `/${hub.hub}` })))] : []),
    ],
  });
}

export default function GuidesIndex({ loaderData }: Route.ComponentProps) {
  const reduce = useReducedMotion() ?? false;
  return (
    <div className="min-h-dvh">
      <IdeasBackground interactive={false} />
      <Nav forceSolid />
      <main className="relative z-10 pt-16">
        {/* Спільна група: коли сітка Bento міняє висоту, перелік нижче їде плавно, а не стрибає. */}
        <LayoutGroup id="guides-page">
          <ArticlesBento articles={loaderData.articles} headingAs="h1" showAllLink={false} />
          {/* Повний перелік: Bento показує до 8 карток, а кожен гайд має мати посилання з цієї сторінки. */}
          <motion.div
            layout={reduce ? false : "position"}
            transition={{ layout: { duration: 0.24, ease: [0.16, 1, 0.3, 1] } }}
          >
            <HubIndex hubs={loaderData.hubs} />
          </motion.div>
        </LayoutGroup>
      </main>
    </div>
  );
}
