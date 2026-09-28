import { data } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { ArticleView } from "~/components/guides/article";
import { getArticle, getRelated, isHubSlug, toView } from "~/lib/content.server";
import { seo } from "~/lib/seo";
import { article, breadcrumbList, compact, docCrumbs, faqPage } from "~/lib/structured-data";
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
    title: fm.title,
    description: fm.description,
    path: doc.path,
    type: "article",
    publishedTime: fm.publishedAt,
    modifiedTime: fm.updatedAt,
    jsonLd: compact([article(doc), breadcrumbList(docCrumbs(doc)), faqPage(fm.faq ?? [])]),
  });
}

export default function ArticlePage({ loaderData }: Route.ComponentProps) {
  return (
    <GuideFrame>
      <ArticleView doc={loaderData.doc} related={loaderData.related} />
    </GuideFrame>
  );
}
