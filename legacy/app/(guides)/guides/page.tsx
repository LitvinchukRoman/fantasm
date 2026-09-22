import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/link";
import { HUB_SLUGS, HUBS, getHub, getArticles } from "@/lib/content";
import { Cover } from "@/components/ui/cover";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Гайди для студентів: стартапи, ігри та кампус",
  description:
    "Практичні гайди NaUKMA Ideas: як запустити студентський стартап, провести ігри та івенти, знайти команду й можливості в кампусі НаУКМА.",
  alternates: { canonical: "/guides" },
};

export default function GuidesIndex() {
  const hubs = HUB_SLUGS.map((hub) => ({ hub, doc: getHub(hub), articles: getArticles(hub) }));

  return (
    <div className="space-y-10 pb-10">
      <header className="max-w-2xl">
        <h1 className="text-h1">Гайди</h1>
        <p className="mt-2 text-lg text-[color:var(--ink-2)]">
          Практичні матеріали для студентів: від запуску стартапу до організації вечора ігор. Навчись — і зроби це у спільноті.
        </p>
      </header>

      <div className="grid gap-6">
        {hubs.map(({ hub, doc, articles }) => (
          <section key={hub} className="card overflow-hidden">
            <div className="grid gap-0 md:grid-cols-[260px_1fr]">
              <Link href={`/${hub}`} className="group relative block">
                <Cover seed={hub} className="h-40 md:h-full">
                  <span className="absolute bottom-4 left-4 font-display text-2xl font-bold text-white">
                    {HUBS[hub].label}
                  </span>
                </Cover>
              </Link>
              <div className="p-6">
                <Link href={`/${hub}`} className="group">
                  <h2 className="text-h3 transition-colors group-hover:text-[color:var(--accent-ink)]">
                    {doc?.frontmatter.title ?? HUBS[hub].label}
                  </h2>
                </Link>
                <p className="mt-1.5 text-[color:var(--ink-2)]">{doc?.frontmatter.description ?? HUBS[hub].tagline}</p>
                <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                  {articles.slice(0, 4).map((a) => (
                    <li key={a.slug}>
                      <Link
                        href={a.path}
                        className="inline-flex items-center gap-1.5 text-sm text-[color:var(--ink-2)] transition-colors hover:text-[color:var(--accent-ink)]"
                      >
                        <ArrowRight className="size-3.5 shrink-0 text-[color:var(--accent-ink)]" />
                        {a.frontmatter.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
