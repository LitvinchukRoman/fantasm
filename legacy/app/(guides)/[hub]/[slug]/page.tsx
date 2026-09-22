import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock } from "lucide-react";
import { HUB_SLUGS, HUBS, getArticle, getArticleSlugs, getRelated, type HubSlug } from "@/lib/content";
import { Mdx } from "@/components/guides/mdx";
import { Toc } from "@/components/guides/toc";
import { FaqSection } from "@/components/guides/faq";
import { Breadcrumbs } from "@/components/guides/breadcrumbs";
import { Related } from "@/components/guides/related";
import { ProductCta } from "@/components/guides/product-cta";
import { LiveEvents } from "@/components/guides/live-events";
import { JsonLd } from "@/components/json-ld";
import { CampusMap } from "@/components/campus/campus-map";

export const revalidate = 3600;
export const dynamicParams = false;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ideas.naukma.com";

export function generateStaticParams() {
  return HUB_SLUGS.flatMap((hub) => getArticleSlugs(hub).map((slug) => ({ hub, slug })));
}

function load(hub: string, slug: string) {
  if (!(HUB_SLUGS as readonly string[]).includes(hub)) return null;
  return getArticle(hub as HubSlug, slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hub: string; slug: string }>;
}): Promise<Metadata> {
  const { hub, slug } = await params;
  const doc = load(hub, slug);
  if (!doc) return { title: "Статтю не знайдено" };
  const { title, description, keywords } = doc.frontmatter;
  return {
    title,
    description,
    keywords,
    alternates: { canonical: doc.path },
    openGraph: { title, description, url: `${siteUrl}${doc.path}`, type: "article" },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ hub: string; slug: string }>;
}) {
  const { hub, slug } = await params;
  const doc = load(hub, slug);
  if (!doc) notFound();
  const hubSlug = hub as HubSlug;
  const fm = doc.frontmatter;
  const related = getRelated(doc);

  return (
    <article className="space-y-10 pb-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: fm.title,
          description: fm.description,
          datePublished: fm.publishedAt,
          dateModified: fm.updatedAt,
          author: { "@type": "Organization", name: "NaUKMA Ideas" },
          publisher: { "@type": "Organization", name: "NaUKMA Ideas" },
          mainEntityOfPage: `${siteUrl}${doc.path}`,
        }}
      />

      <header className="space-y-4">
        <Breadcrumbs
          items={[
            { label: "Головна", href: "/" },
            { label: "Гайди", href: "/guides" },
            { label: HUBS[hubSlug].label, href: `/${hubSlug}` },
            { label: fm.title, href: doc.path },
          ]}
        />
        <h1 className="text-h1">{fm.title}</h1>
        <p className="measure text-lg text-[color:var(--ink-2)]">{fm.description}</p>
        <div className="text-caption flex items-center gap-1.5">
          <Clock className="size-3.5" /> {doc.readingMinutes} хв читання
        </div>
      </header>

      {fm.widget === "campus-map" && (
        <section aria-label="Інтерактивна карта кампусу НаУКМА">
          <CampusMap />
        </section>
      )}

      <div className="grid gap-10 lg:grid-cols-[1fr_240px]">
        <div className="space-y-12">
          <Mdx source={doc.body} />
          <FaqSection items={fm.faq ?? []} />
          <LiveEvents
            title={fm.liveTitle}
            tag={fm.liveTag}
            category={fm.liveCategory}
            ctaHref={fm.cta?.href}
            ctaLabel={fm.cta?.label}
          />
          <ProductCta cta={fm.cta} />
          <Related items={related} />
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Toc items={doc.toc} />
          </div>
        </aside>
      </div>
    </article>
  );
}
