import { GuideFrame } from "~/components/guides/frame";
import { ArticleView } from "~/components/guides/article";
import { getArticles, getHub, getRelated, isHubSlug } from "~/lib/content";

export function loader({ params }: { params: { hub?: string } }) {
  const hub = params.hub ?? "";
  if (!isHubSlug(hub)) throw new Response("Not found", { status: 404 });
  const doc = getHub(hub);
  if (!doc) throw new Response("Not found", { status: 404 });
  return {
    doc,
    related: getRelated(doc),
    articles: getArticles(hub).map((article) => ({
      title: article.frontmatter.title,
      description: article.frontmatter.description,
      path: article.path,
    })),
  };
}

export function meta({ data }: { data: { doc: { frontmatter: { title: string; description: string } } } | undefined }) {
  if (!data) return [{ title: "Розділ не знайдено" }];
  return [
    { title: data.doc.frontmatter.title },
    { name: "description", content: data.doc.frontmatter.description },
  ];
}

export default function HubPage({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>;
}) {
  return (
    <GuideFrame>
      <ArticleView doc={loaderData.doc} related={loaderData.related} />
      {loaderData.articles.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">Матеріали розділу</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {loaderData.articles.map((article) => (
              <li key={article.path}>
                <a
                  href={article.path}
                  className="block rounded-[var(--radius-card)] border border-[var(--color-border)] p-4 hover:border-[var(--color-border-strong)]"
                >
                  <div className="font-medium text-[var(--color-text)]">{article.title}</div>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">{article.description}</p>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </GuideFrame>
  );
}
