import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import GithubSlugger from "github-slugger";
import matter from "gray-matter";
import { HUB_SLUGS, type HubSlug } from "./content-meta";

export { HUBS, HUB_SLUGS, isHubSlug } from "./content-meta";
export type { HubSlug } from "./content-meta";

const CONTENT_DIR = join(process.cwd(), "content");

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
  related?: string[];
  order?: number;
  widget?: string;
}
export interface TocItem {
  depth: 2 | 3;
  text: string;
  id: string;
}
export interface Doc {
  hub: HubSlug;
  slug: string;
  isPillar: boolean;
  path: string;
  frontmatter: Frontmatter;
  body: string;
  readingMinutes: number;
  toc: TocItem[];
}

function docPath(hub: HubSlug, slug: string) {
  return slug ? `/${hub}/${slug}` : `/${hub}`;
}

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
    const match = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
    if (!match) continue;
    const depth = match[1].length as 2 | 3;
    const text = match[2].replace(/[*_`]/g, "").trim();
    out.push({ depth, text, id: slugger.slug(text) });
  }
  return out;
}

function readingMinutes(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

function parseFile(hub: HubSlug, slug: string, file: string): Doc {
  const { data, content } = matter(readFileSync(file, "utf8"));
  const frontmatter = data as Frontmatter;
  return {
    hub,
    slug,
    isPillar: slug === "",
    path: docPath(hub, slug),
    frontmatter,
    body: content,
    readingMinutes: readingMinutes(content),
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
    .filter((file) => file.endsWith(".mdx") && file !== "index.mdx")
    .map((file) => file.replace(/\.mdx$/, ""));
}

export function getArticle(hub: HubSlug, slug: string): Doc | null {
  const file = join(CONTENT_DIR, hub, `${slug}.mdx`);
  if (!existsSync(file)) return null;
  return parseFile(hub, slug, file);
}

export function getArticles(hub: HubSlug): Doc[] {
  return getArticleSlugs(hub)
    .map((slug) => getArticle(hub, slug))
    .filter((doc): doc is Doc => doc !== null)
    .sort((a, b) => (a.frontmatter.order ?? 99) - (b.frontmatter.order ?? 99));
}

export function getAllDocs(): Doc[] {
  const docs: Doc[] = [];
  for (const hub of HUB_SLUGS) {
    const pillar = getHub(hub);
    if (pillar) docs.push(pillar);
    docs.push(...getArticles(hub));
  }
  return docs;
}

export function getRelated(doc: Doc): { title: string; description: string; path: string }[] {
  const picked = (doc.frontmatter.related ?? [])
    .map((slug) => getArticle(doc.hub, slug))
    .filter((item): item is Doc => item !== null);
  const pool = picked.length
    ? picked
    : getArticles(doc.hub)
        .filter((item) => item.slug !== doc.slug)
        .slice(0, 3);
  return pool.map((item) => ({
    title: item.frontmatter.title,
    description: item.frontmatter.description,
    path: item.path,
  }));
}
