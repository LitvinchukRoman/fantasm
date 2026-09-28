import type { MetaDescriptor } from "react-router";

/**
 * Єдине джерело абсолютних URL для canonical, OG, sitemap і robots.
 * `VITE_` потрібен, бо meta() виконується і на сервері, і в браузері
 * (клієнтські переходи), а Vite вшиває в клієнт лише змінні з цим префіксом.
 */
export const SITE_URL = (import.meta.env.VITE_SITE_URL || "https://ideas.naukma.com").replace(/\/+$/, "");
export const SITE_NAME = "Fantasm";
export const SITE_LOCALE = "uk_UA";
export const SITE_LANGUAGE = "uk";
export const SITE_LOGO = "/favicon.jpg";

/** Шлях без кінцевого слеша (крім кореня): так віддає сервер і так посилаються сторінки. */
export function normalizePath(path: string): string {
  const clean = path.split(/[?#]/)[0] || "/";
  return clean.length > 1 ? clean.replace(/\/+$/, "") : "/";
}

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const normalized = normalizePath(path.startsWith("/") ? path : `/${path}`);
  return normalized === "/" ? `${SITE_URL}/` : `${SITE_URL}${normalized}`;
}

export type JsonLd = Record<string, unknown>;

export interface SeoInput {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  image?: string;
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
  image = SITE_LOGO,
  noindex = false,
  publishedTime,
  modifiedTime,
  jsonLd = [],
}: SeoInput): MetaDescriptor[] {
  const url = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);
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
    // Єдине зображення бренду квадратне (564×564), тому summary, а не summary_large_image.
    { name: "twitter:card", content: "summary" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: imageUrl },
  ];
  if (type === "article" && publishedTime) {
    tags.push({ property: "article:published_time", content: publishedTime });
  }
  if (type === "article" && modifiedTime) {
    tags.push({ property: "article:modified_time", content: modifiedTime });
  }
  for (const item of jsonLd) tags.push({ "script:ld+json": item });
  return tags;
}

/** Для сторінок, які не мають потрапляти в індекс: логін, заглушки, службові. */
export function noindexSeo(input: Omit<SeoInput, "noindex" | "jsonLd">): MetaDescriptor[] {
  return seo({ ...input, noindex: true });
}
