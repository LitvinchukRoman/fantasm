// Перевірка structured data і мета-тегів у зібраному build/client (після `npm run build`).
// Не заміна Google Rich Results Test, а швидкий гард від регресій: валідний JSON-LD,
// обовʼязкові поля, існуючі картинки, розмітка = видимий контент.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../build/client", import.meta.url).pathname;
const PUBLIC = new URL("../public", import.meta.url).pathname;
const errors = [];
const stats = { pages: 0, indexable: 0, nodes: 0 };

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : name === "index.html" ? [full] : [];
  });
}

const fail = (page, msg) => errors.push(`${page}: ${msg}`);
const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
const decode = (s) =>
  s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function imageFileExists(url) {
  const path = new URL(url).pathname;
  return existsSync(join(PUBLIC, path)) || existsSync(join(ROOT, path));
}

for (const file of walk(ROOT)) {
  const page = "/" + relative(ROOT, file).replace(/index\.html$/, "").replace(/\/$/, "");
  const html = readFileSync(file, "utf8");
  stats.pages++;
  const robots = /<meta[^>]+name="robots"[^>]+content="([^"]*)"/.exec(html)?.[1] ?? "";
  if (robots.includes("noindex")) continue;
  stats.indexable++;

  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
  if (!title) fail(page, "немає <title>");
  else if (decode(title).length > 70) fail(page, `<title> ${decode(title).length} символів (>70)`);
  if (!/<link[^>]+rel="canonical"/.test(html)) fail(page, "немає canonical");
  if (!/<meta[^>]+name="description"/.test(html)) fail(page, "немає meta description");
  for (const prop of ["og:image", "og:image:width", "og:image:height", "og:image:alt"]) {
    if (!html.includes(`property="${prop}"`)) fail(page, `немає ${prop}`);
  }
  if (!/name="twitter:card"[^>]+content="summary_large_image"/.test(html)) fail(page, "twitter:card не summary_large_image");
  const ogImg = /property="og:image"[^>]+content="([^"]+)"/.exec(html)?.[1];
  if (ogImg && !imageFileExists(ogImg)) fail(page, `og:image не існує на диску: ${ogImg}`);

  const scripts = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  if (scripts.length === 0) {
    fail(page, "немає JSON-LD");
    continue;
  }
  const nodes = [];
  for (const [, raw] of scripts) {
    try {
      const json = JSON.parse(decode(raw));
      nodes.push(...asArray(json["@graph"] ?? json));
    } catch (e) {
      fail(page, `JSON-LD не парситься: ${e.message}`);
    }
  }
  stats.nodes += nodes.length;
  const byId = new Map(nodes.filter((n) => n["@id"]).map((n) => [n["@id"], n]));
  const byType = (t) => nodes.filter((n) => asArray(n["@type"]).includes(t));

  for (const t of ["Organization", "WebSite"]) if (byType(t).length !== 1) fail(page, `очікується рівно один ${t}`);

  // Усі посилання {"@id": ...} мають вести на вузол цього ж графа.
  const walkRefs = (v) => {
    if (Array.isArray(v)) return v.forEach(walkRefs);
    if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (keys.length === 1 && keys[0] === "@id" && !byId.has(v["@id"])) fail(page, `висяче посилання @id ${v["@id"]}`);
      Object.values(v).forEach(walkRefs);
    }
  };
  nodes.forEach(walkRefs);

  for (const a of byType("Article")) {
    for (const f of ["headline", "datePublished", "dateModified", "image", "author", "publisher", "description"]) {
      if (!a[f]) fail(page, `Article без ${f}`);
    }
    if (a.headline && a.headline.length > 110) fail(page, "Article.headline >110");
    const images = asArray(a.image);
    if (images.length !== 3) fail(page, `Article.image: очікується 3 пропорції, є ${images.length}`);
    for (const img of images) if (!imageFileExists(img.url)) fail(page, `Article.image не існує: ${img.url}`);
    if (!(a.wordCount > 200)) fail(page, `підозріло малий wordCount: ${a.wordCount}`);
  }

  // Розмітка = видимий контент: кожне питання FAQPage має бути в тексті сторінки.
  const visible = decode(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
  for (const f of byType("FAQPage")) {
    for (const q of asArray(f.mainEntity)) {
      if (!q.name || !q.acceptedAnswer?.text) fail(page, "FAQ-питання без name/acceptedAnswer.text");
      else if (!visible.includes(q.name.replace(/\s+/g, " ").trim())) fail(page, `FAQ-питання немає на сторінці: ${q.name}`);
    }
  }

  for (const b of byType("BreadcrumbList")) {
    asArray(b.itemListElement).forEach((li, i) => {
      if (li.position !== i + 1 || !li.name || !li.item) fail(page, `BreadcrumbList: некоректний елемент ${i + 1}`);
    });
  }
}

console.log(`Сторінок: ${stats.pages}, індексованих: ${stats.indexable}, вузлів JSON-LD: ${stats.nodes}`);
if (errors.length) {
  console.error(`\nПомилок: ${errors.length}`);
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
}
console.log("check:seo OK");
