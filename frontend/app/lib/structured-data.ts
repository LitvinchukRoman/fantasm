import type { DocView, Faq } from "./content-meta";
import { HUBS } from "./content-meta";
import { NAUKMA, type IdeaView } from "./ideas";
import { SITE_LANGUAGE, SITE_LOGO, SITE_NAME, SITE_URL, absoluteUrl, type JsonLd } from "./seo";

/**
 * Schema.org розмітка з тих самих даних лоадера, що й сторінка. Правило Google:
 * у JSON-LD лише те, що користувач бачить на сторінці, інакше це spam-сигнал.
 */

const CONTEXT = "https://schema.org";
const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;

const NAUKMA_ADDRESS = {
  "@type": "PostalAddress",
  streetAddress: "вул. Григорія Сковороди, 2",
  addressLocality: "Київ",
  postalCode: "04070",
  addressCountry: "UA",
};

function organizationRef() {
  return { "@id": ORG_ID };
}

export function organization(): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: absoluteUrl(SITE_LOGO),
    description: "Платформа ідей спільноти Києво-Могилянської академії.",
  };
}

export function website(): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: SITE_LANGUAGE,
    publisher: organizationRef(),
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbList(crumbs: Crumb[]): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

/** Ті самі крихти, що малює ArticleView: розмітка і видимий UI не розходяться. */
export function docCrumbs(doc: Pick<DocView, "hub" | "isPillar" | "path" | "frontmatter">): Crumb[] {
  return [
    { name: "Головна", path: "/" },
    { name: "Гайди", path: "/guides" },
    { name: HUBS[doc.hub].label, path: `/${doc.hub}` },
    ...(doc.isPillar ? [] : [{ name: doc.frontmatter.title, path: doc.path }]),
  ];
}

export function article(doc: DocView): JsonLd {
  const fm = doc.frontmatter;
  const url = absoluteUrl(doc.path);
  return {
    "@context": CONTEXT,
    "@type": "Article",
    "@id": `${url}#article`,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    // Google обрізає headline довше 110 символів.
    headline: fm.title.slice(0, 110),
    description: fm.description,
    inLanguage: SITE_LANGUAGE,
    datePublished: fm.publishedAt,
    dateModified: fm.updatedAt ?? fm.publishedAt,
    image: [absoluteUrl(SITE_LOGO)],
    author: organizationRef(),
    publisher: organizationRef(),
    isPartOf: { "@id": SITE_ID },
    articleSection: HUBS[doc.hub].label,
    ...(fm.keywords?.length ? { keywords: fm.keywords.join(", ") } : {}),
    timeRequired: `PT${doc.readingMinutes}M`,
  };
}

export function faqPage(items: Faq[]): JsonLd | null {
  if (items.length === 0) return null;
  return {
    "@context": CONTEXT,
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function itemList(items: { name: string; path: string }[]): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "ItemList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: absoluteUrl(item.path),
    })),
  };
}

export function collectionPage({ name, description, path }: { name: string; description: string; path: string }): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "CollectionPage",
    name,
    description,
    url: absoluteUrl(path),
    inLanguage: SITE_LANGUAGE,
    isPartOf: { "@id": SITE_ID },
  };
}

/**
 * Event вимагає location з поштовою адресою. Її знаємо лише для подій
 * кампусу НаУКМА; подію без адреси Google відхилить як невалідну, тож
 * для неї розмітку не віддаємо зовсім.
 */
export function event(idea: IdeaView): JsonLd | null {
  if (idea.category !== "EVENT" || !idea.eventAt) return null;
  if (idea.campus?.id !== NAUKMA.id) return null;
  const url = absoluteUrl(`/ideas/${idea.slug}`);
  return {
    "@context": CONTEXT,
    "@type": "Event",
    "@id": `${url}#event`,
    name: idea.title,
    description: idea.summary,
    url,
    startDate: idea.eventAt,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    inLanguage: SITE_LANGUAGE,
    image: [absoluteUrl(SITE_LOGO)],
    location: {
      "@type": "Place",
      name: idea.eventLocation || "Національний університет «Києво-Могилянська академія»",
      address: NAUKMA_ADDRESS,
    },
    organizer: { "@type": "Organization", name: idea.author.name, url: `${SITE_URL}/` },
  };
}

export function compact(items: (JsonLd | null)[]): JsonLd[] {
  return items.filter((item): item is JsonLd => item !== null);
}
