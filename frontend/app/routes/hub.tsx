import { data, Link } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { ArticleView } from "~/components/guides/article";
import { getArticles, getHub, getRelated, isHubSlug, toLink, toView } from "~/lib/content.server";
import { seo } from "~/lib/seo";
import { article, breadcrumbList, compact, docCrumbs, faqPage, itemList } from "~/lib/structured-data";
import type { Route } from "./+types/hub";

export function loader({ params }: Route.LoaderArgs) {
  if (!isHubSlug(params.hub)) throw data("Not found", { status: 404 });
  const doc = getHub(params.hub);
  if (!doc) throw data("Not found", { status: 404 });
  return {
    doc: toView(doc),
    related: getRelated(doc),
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
    jsonLd: compact([
      article(doc),
      breadcrumbList(docCrumbs(doc)),
      faqPage(fm.faq ?? []),
      articles.length > 0 ? itemList(articles.map((item) => ({ name: item.title, path: item.path }))) : null,
    ]),
  });
}

export default function HubPage({ loaderData }: Route.ComponentProps) {
  return (
    <GuideFrame>
      <ArticleView doc={loaderData.doc} related={loaderData.related} />
      {loaderData.articles.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">Матеріали розділу</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {loaderData.articles.map((article) => (
              <li key={article.path}>
                <Link
                  to={article.path}
                  prefetch="intent"
                  className="block rounded-[var(--radius-card)] border border-[var(--color-border)] p-4 hover:border-[var(--color-border-strong)]"
                >
                  <div className="font-medium text-[var(--color-text)]">{article.title}</div>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{article.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </GuideFrame>
  );
}
