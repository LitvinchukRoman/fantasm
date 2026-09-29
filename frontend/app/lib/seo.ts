import type { MetaDescriptor } from "react-router";
import { DEFAULT_OG_BASE, SITE_LOCALE, SITE_NAME, absoluteUrl, ogImage, type JsonLd } from "./site";
import { graph, organization, website } from "./structured-data";

// Решта модулів імпортує ці речі з "~/lib/seo", тож лишаємо реекспорт.
export * from "./site";

export interface SeoInput {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  /** База шляху превʼю без пропорції й розширення, напр. "/og/campus/karta-kampusu". */
  ogBase?: string;
  imageAlt?: string;
  /** Розділ і теги для article:section / article:tag. */
  section?: string;
  tags?: string[];
  noindex?: boolean;
  publishedTime?: string;
  modifiedTime?: string;
  jsonLd?: JsonLd[];
}

export function seo({
  title,
  description,
  path,
  type = "website",
  ogBase: base = DEFAULT_OG_BASE,
  imageAlt,
  section,
  tags: tagList = [],
  noindex = false,
  publishedTime,
  modifiedTime,
  jsonLd = [],
}: SeoInput): MetaDescriptor[] {
  const url = absoluteUrl(path);
  const og = ogImage(base);
  const imageUrl = absoluteUrl(og.path);
  const alt = imageAlt ?? title;
  const tags: MetaDescriptor[] = [
    { title },
    { name: "description", content: description },
    { tagName: "link", rel: "canonical", href: url },
    {
      name: "robots",
      content: noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1",
    },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: SITE_LOCALE },
    { property: "og:type", content: type },
    { property: "og:url", content: url },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: imageUrl },
    { property: "og:image:width", content: String(og.width) },
    { property: "og:image:height", content: String(og.height) },
    { property: "og:image:type", content: "image/jpeg" },
    { property: "og:image:alt", content: alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: imageUrl },
    { name: "twitter:image:alt", content: alt },
  ];
  if (type === "article" && publishedTime) {
    tags.push({ property: "article:published_time", content: publishedTime });
  }
  if (type === "article" && modifiedTime) {
    tags.push({ property: "article:modified_time", content: modifiedTime });
  }
  if (type === "article" && section) tags.push({ property: "article:section", content: section });
  if (type === "article") for (const tag of tagList) tags.push({ property: "article:tag", content: tag });
  // Один @graph на сторінку: Organization і WebSite входять у кожен, бо @id-посилання
  // з Article/WebPage не резолвляться між різними сторінками.
  if (!noindex) tags.push({ "script:ld+json": graph([organization(), website(), ...jsonLd]) });
  return tags;
}

/** Для сторінок, які не мають потрапляти в індекс: логін, заглушки, службові. */
export function noindexSeo(input: Omit<SeoInput, "noindex" | "jsonLd">): MetaDescriptor[] {
  return seo({ ...input, noindex: true });
}
