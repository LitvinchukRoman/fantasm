import type { MetaFunction } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { HUB_SLUGS, HUBS, getArticles, getHub } from "~/lib/content";

export const meta: MetaFunction = () => [
  { title: "Гайди для студентів: стартапи, ігри та кампус" },
  {
    name: "description",
    content:
      "Практичні гайди Fantasm: як запустити студентський стартап, провести ігри та івенти, знайти команду й можливості в кампусі НаУКМА.",
  },
];

export function loader() {
  return {
    hubs: HUB_SLUGS.map((hub) => ({
      hub,
      label: HUBS[hub].label,
      tagline: HUBS[hub].tagline,
      title: getHub(hub)?.frontmatter.title ?? HUBS[hub].label,
      description: getHub(hub)?.frontmatter.description ?? HUBS[hub].tagline,
      articles: getArticles(hub)
        .slice(0, 4)
        .map((article) => ({ title: article.frontmatter.title, path: article.path })),
    })),
  };
}

export default function GuidesIndex({
  loaderData,
}: {
  loaderData: {
    hubs: {
      hub: string;
      label: string;
      tagline: string;
      title: string;
      description: string;
      articles: { title: string; path: string }[];
    }[];
  };
}) {
  return (
    <GuideFrame>
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text)] sm:text-4xl">
          Гайди
        </h1>
        <p className="mt-3 text-lg text-[var(--color-text-muted)]">
          Практичні матеріали для студентів: від запуску стартапу до організації вечора ігор.
        </p>
      </header>
      <div className="mt-10 grid gap-5">
        {loaderData.hubs.map((hub) => (
          <section
            key={hub.hub}
            className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
          >
            <a href={`/${hub.hub}`} className="text-xl font-semibold text-[var(--color-text)] hover:text-[var(--color-accent)]">
              {hub.title}
            </a>
            <p className="mt-1.5 text-[var(--color-text-muted)]">{hub.description}</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {hub.articles.map((article) => (
                <li key={article.path}>
                  <a href={article.path} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
                    {article.title}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </GuideFrame>
  );
}

