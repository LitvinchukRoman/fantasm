import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowRight, Clock } from "lucide-react";
import { Link } from "@/lib/link";
import { HUB_SLUGS, HUBS, getHub, getArticles, type HubSlug } from "@/lib/content";
import { Mdx } from "@/components/guides/mdx";
import { Toc } from "@/components/guides/toc";
import { FaqSection } from "@/components/guides/faq";
import { Breadcrumbs } from "@/components/guides/breadcrumbs";
import { ProductCta } from "@/components/guides/product-cta";
import { LiveEvents } from "@/components/guides/live-events";
import { JsonLd } from "@/components/json-ld";

export const revalidate = 3600;
export const dynamicParams = false;

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ideas.naukma.com";

export function generateStaticParams() {
  return HUB_SLUGS.map((hub) => ({ hub }));
}

function load(hubParam: string) {
  if (!(HUB_SLUGS as readonly string[]).includes(hubParam)) return null;
  return getHub(hubParam as HubSlug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hub: string }>;
}): Promise<Metadata> {
  const { hub } = await params;
  const doc = load(hub);
  if (!doc) return { title: "Гайд не знайдено" };
  const { title, description, keywords } = doc.frontmatter;
  return {
    title,
    description,
    keywords,
    alternates: { canonical: doc.path },
    openGraph: { title, description, url: `${siteUrl}${doc.path}`, type: "article" },
  };
}

export default async function HubPage({ params }: { params: Promise<{ hub: string }> }) {
  const { hub } = await params;
  const doc = load(hub);
  if (!doc) notFound();
  const hubSlug = hub as HubSlug;
  const articles = getArticles(hubSlug);
  const fm = doc.frontmatter;

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
            { label: HUBS[hubSlug].label, href: doc.path },
          ]}
        />
        <h1 className="text-h1">{fm.title}</h1>
        <p className="measure text-lg text-[color:var(--ink-2)]">{fm.description}</p>
        <div className="text-caption flex items-center gap-1.5">
          <Clock className="size-3.5" /> {doc.readingMinutes} хв читання
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[1fr_240px]">
        <div className="space-y-12">
          <Mdx source={doc.body} />

          <section className="space-y-4">
            <h2 className="text-h2">Статті кластера</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {articles.map((a) => (
                <Link
                  key={a.slug}
                  href={a.path}
                  className="group rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] p-5 transition-colors duration-[var(--dur-2)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
                >
                  <h3 className="font-semibold leading-snug transition-colors group-hover:text-[color:var(--accent-ink)]">
                    {a.frontmatter.title}
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-sm text-[color:var(--ink-2)]">{a.frontmatter.description}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--accent-ink)]">
                    Читати <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <FaqSection items={fm.faq ?? []} />

          <LiveEvents
            title={fm.liveTitle}
            tag={fm.liveTag}
            category={fm.liveCategory}
            ctaHref={fm.cta?.href}
            ctaLabel={fm.cta?.label}
          />

          <ProductCta cta={fm.cta} />
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
