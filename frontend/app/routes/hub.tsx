import { data } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { ArticleView } from "~/components/guides/article";
import { getArticles, getHub, isHubSlug, toLink, toView } from "~/lib/content.server";
import { ogBase, seo } from "~/lib/seo";
import { compact, docNodes, itemList } from "~/lib/structured-data";
import { HUBS } from "~/lib/content-meta";
import type { Route } from "./+types/hub";

export function loader({ params }: Route.LoaderArgs) {
  if (!isHubSlug(params.hub)) throw data("Not found", { status: 404 });
  const doc = getHub(params.hub);
  if (!doc) throw data("Not found", { status: 404 });
  return {
    doc: toView(doc),
    articles: getArticles(params.hub).map(toLink),
  };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { doc, articles } = data;
  const fm = doc.frontmatter;
  return seo({
    title: fm.title,
    description: fm.description,
    path: doc.path,
    type: "article",
    publishedTime: fm.publishedAt,
    modifiedTime: fm.updatedAt,
    ogBase: ogBase(doc.path, true),
    imageAlt: fm.title,
    section: HUBS[doc.hub].label,
    tags: fm.keywords,
    jsonLd: compact([
      ...docNodes(doc),
      articles.length > 0 ? itemList(articles.map((item) => ({ name: item.title, path: item.path }))) : null,
    ]),
  });
}

export default function HubPage({ loaderData }: Route.ComponentProps) {
  return (
    <GuideFrame>
      <ArticleView doc={loaderData.doc} roadmap={loaderData.articles} roadmapTitle="Матеріали розділу" />
    </GuideFrame>
  );
}
