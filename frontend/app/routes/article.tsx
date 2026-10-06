import { data } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { ArticleView } from "~/components/guides/article";
import { getArticle, getRelated, isHubSlug, toView } from "~/lib/content.server";
import { ogBase, seo } from "~/lib/seo";
import { docNodes } from "~/lib/structured-data";
import { HUBS } from "~/lib/content-meta";
import type { Route } from "./+types/article";

export function loader({ params }: Route.LoaderArgs) {
  if (!isHubSlug(params.hub)) throw data("Not found", { status: 404 });
  const doc = getArticle(params.hub, params.slug);
  if (!doc) throw data("Not found", { status: 404 });
  return { doc: toView(doc), related: getRelated(doc) };
}

export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  const { doc } = data;
  const fm = doc.frontmatter;
  return seo({
    title: fm.seoTitle ?? fm.title,
    description: fm.description,
    path: doc.path,
    type: "article",
    publishedTime: fm.publishedAt,
    modifiedTime: fm.updatedAt,
    ogBase: ogBase(doc.path),
    imageAlt: fm.title,
    section: HUBS[doc.hub].label,
    tags: fm.keywords,
    jsonLd: docNodes(doc),
  });
}

export default function ArticlePage({ loaderData }: Route.ComponentProps) {
  return (
    <GuideFrame>
      <ArticleView doc={loaderData.doc} roadmap={loaderData.related} />
    </GuideFrame>
  );
}
