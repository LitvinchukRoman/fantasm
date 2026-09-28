import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import GithubSlugger from "github-slugger";
import matter from "gray-matter";
import { HUB_SLUGS, type DocLink, type DocView, type Frontmatter, type HubSlug, type TocItem } from "./content-meta";
import { renderMarkdown } from "./markdown.server";

export { HUBS, HUB_SLUGS, isHubSlug } from "./content-meta";
export type { HubSlug } from "./content-meta";

const CONTENT_DIR = join(process.cwd(), "content");

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

/** Службові заголовки-заклики в кінці статті: у тексті лишаються, у змісті лише дрібнять навігацію. */
const TOC_SKIP = new Set(["наступний крок"]);

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
    // slug рахуємо й для пропущених, щоб id наступних заголовків збігалися з rehype-slug.
    const id = slugger.slug(text);
    if (TOC_SKIP.has(text.toLowerCase())) continue;
    out.push({ depth, text, id });
  }
  return out;
}

function readingMinutes(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 180));
}

// Пререндер викликає ті самі файли з кожної сторінки (related, списки хабу).
// Ключ з mtime: у dev правка MDX одразу видима, у білді файл парситься один раз.
const cache = new Map<string, { mtimeMs: number; doc: Doc }>();

function parseFile(hub: HubSlug, slug: string, file: string): Doc {
  const { mtimeMs } = statSync(file);
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return hit.doc;
  const { data, content } = matter(readFileSync(file, "utf8"));
  const doc: Doc = {
    hub,
    slug,
    isPillar: slug === "",
    path: docPath(hub, slug),
    frontmatter: data as Frontmatter,
    body: content,
    readingMinutes: readingMinutes(content),
    toc: buildToc(content),
  };
  cache.set(file, { mtimeMs, doc });
  return doc;
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
  // slug приходить з URL: без цієї перевірки "../" вийшов би за межі content/.
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
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

export function toLink(doc: Doc): DocLink {
  return { title: doc.frontmatter.title, description: doc.frontmatter.description, path: doc.path };
}

export function getRelated(doc: Doc): DocLink[] {
  const picked = (doc.frontmatter.related ?? [])
    .map((slug) => getArticle(doc.hub, slug))
    .filter((item): item is Doc => item !== null);
  const pool = picked.length
    ? picked
    : getArticles(doc.hub)
        .filter((item) => item.slug !== doc.slug)
        .slice(0, 3);
  return pool.map(toLink);
}

const htmlCache = new WeakMap<Doc, string>();

export function toView(doc: Doc): DocView {
  let html = htmlCache.get(doc);
  if (html === undefined) {
    html = renderMarkdown(doc.body);
    htmlCache.set(doc, html);
  }
  const { body: _body, ...rest } = doc;
  return { ...rest, html };
}
