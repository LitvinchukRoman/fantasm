import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import readingTime from "reading-time";
import GithubSlugger from "github-slugger";

/**
 * Filesystem-backed MDX content for the SEO topic clusters. No backend changes:
 * pillars live at content/<hub>/index.mdx, articles at content/<hub>/<slug>.mdx.
 * Everything is read at build time (routes are fully static / SSG).
 */
const CONTENT_DIR = join(process.cwd(), "content");

export const HUB_SLUGS = ["startups", "games", "campus"] as const;
export type HubSlug = (typeof HUB_SLUGS)[number];

/** Short display metadata for hubs (used in nav cards / breadcrumbs). */
export const HUBS: Record<HubSlug, { label: string; tagline: string }> = {
  startups: { label: "Стартапи", tagline: "Запусти проєкт зі студентської лави" },
  games: { label: "Ігри та івенти", tagline: "Збери компанію офлайн" },
  campus: { label: "Кампус НаУКМА", tagline: "Життя, клуби й можливості" },
};

export interface Faq {
  q: string;
  a: string;
}
export interface Cta {
  label: string;
  href: string;
  note?: string;
}
export interface Frontmatter {
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  keywords?: string[];
  faq?: Faq[];
  cta?: Cta;
  /** Live product block: idea category or tag to pull fresh cards from the API. */
  liveTag?: string;
  liveCategory?: string;
  liveTitle?: string;
  /** Related article slugs within the same hub. */
  related?: string[];
  order?: number;
  /** Full-width interactive widget rendered above the prose (e.g. "campus-map"). */
  widget?: string;
}
export interface TocItem {
  depth: 2 | 3;
  text: string;
  id: string;
}
export interface Doc {
  hub: HubSlug;
  slug: string; // "" for the pillar
  isPillar: boolean;
  path: string; // url
  frontmatter: Frontmatter;
  body: string; // raw MDX (frontmatter stripped)
  readingMinutes: number;
  toc: TocItem[];
}

function docPath(hub: HubSlug, slug: string) {
  return slug ? `/${hub}/${slug}` : `/${hub}`;
}

/** Extract h2/h3 headings, skipping fenced code, with rehype-slug-compatible ids. */
function buildToc(body: string): TocItem[] {
  const slugger = new GithubSlugger();
  const out: TocItem[] = [];
  let inFence = false;
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
    if (!m) continue;
    const depth = m[1].length as 2 | 3;
    const text = m[2].replace(/[*_`]/g, "").trim();
    out.push({ depth, text, id: slugger.slug(text) });
  }
  return out;
}

function parseFile(hub: HubSlug, slug: string, file: string): Doc {
  const { data, content } = matter(readFileSync(file, "utf8"));
  const fm = data as Frontmatter;
  return {
    hub,
    slug,
    isPillar: slug === "",
    path: docPath(hub, slug),
    frontmatter: fm,
    body: content,
    readingMinutes: Math.max(1, Math.round(readingTime(content).minutes)),
    toc: buildToc(content),
  };
}

export function getHub(hub: HubSlug): Doc | null {
  const file = join(CONTENT_DIR, hub, "index.mdx");
  if (!existsSync(file)) return null;
  return parseFile(hub, "", file);
}

export function getArticleSlugs(hub: HubSlug): string[] {
  const dir = join(CONTENT_DIR, hub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".mdx") && f !== "index.mdx")
    .map((f) => f.replace(/\.mdx$/, ""));
}

export function getArticle(hub: HubSlug, slug: string): Doc | null {
  const file = join(CONTENT_DIR, hub, `${slug}.mdx`);
  if (!existsSync(file)) return null;
  return parseFile(hub, slug, file);
}

export function getArticles(hub: HubSlug): Doc[] {
  return getArticleSlugs(hub)
    .map((s) => getArticle(hub, s))
    .filter((d): d is Doc => d !== null)
    .sort((a, b) => (a.frontmatter.order ?? 99) - (b.frontmatter.order ?? 99));
}

/** Pillars + all articles — for the sitemap and the /guides index. */
export function getAllDocs(): Doc[] {
  const docs: Doc[] = [];
  for (const hub of HUB_SLUGS) {
    const pillar = getHub(hub);
    if (pillar) docs.push(pillar);
    docs.push(...getArticles(hub));
  }
  return docs;
}

/** Resolve a doc's related-slugs into light link cards (same hub). */
export function getRelated(doc: Doc): { title: string; description: string; path: string }[] {
  const slugs = doc.frontmatter.related ?? [];
  const picked = slugs
    .map((s) => getArticle(doc.hub, s))
    .filter((d): d is Doc => d !== null);
  // Fallback: other articles in the hub.
  const pool = picked.length ? picked : getArticles(doc.hub).filter((d) => d.slug !== doc.slug).slice(0, 3);
  return pool.map((d) => ({
    title: d.frontmatter.title,
    description: d.frontmatter.description,
    path: d.path,
  }));
}
