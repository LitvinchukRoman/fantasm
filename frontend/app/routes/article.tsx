import { GuideFrame } from "~/components/guides/frame";
import { ArticleView } from "~/components/guides/article";
import { getArticle, getRelated, isHubSlug } from "~/lib/content";

export function loader({ params }: { params: { hub?: string; slug?: string } }) {
  const hub = params.hub ?? "";
  const slug = params.slug ?? "";
  if (!isHubSlug(hub)) throw new Response("Not found", { status: 404 });
  const doc = getArticle(hub, slug);
  if (!doc) throw new Response("Not found", { status: 404 });
  return { doc, related: getRelated(doc) };
}

export function meta({
  data,
}: {
  data: { doc: { frontmatter: { title: string; description: string } } } | undefined;
}) {
  if (!data) return [{ title: "Статтю не знайдено" }];
  return [
    { title: data.doc.frontmatter.title },
    { name: "description", content: data.doc.frontmatter.description },
  ];
}

export default function ArticlePage({
  loaderData,
}: {
  loaderData: Awaited<ReturnType<typeof loader>>;
}) {
  return (
    <GuideFrame>
      <ArticleView doc={loaderData.doc} related={loaderData.related} />
    </GuideFrame>
  );
}
