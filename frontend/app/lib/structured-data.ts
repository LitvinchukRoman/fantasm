import type { DocView, Faq } from "./content-meta";
import { HUBS } from "./content-meta";
import type { ForumPost, ForumThread } from "./forum";
import { NAUKMA, type IdeaAuthor, type IdeaView } from "./ideas";
import { DEFAULT_OG_BASE, OG_SIZES, SITE_LANGUAGE, SITE_LOGO, SITE_LOGO_SIZE, SITE_NAME, SITE_URL, absoluteUrl, ogBase, type JsonLd, type OgRatio } from "./site";

/**
 * Schema.org розмітка з тих самих даних лоадера, що й сторінка. Правило Google:
 * у JSON-LD лише те, що користувач бачить на сторінці, інакше це spam-сигнал.
 */

const CONTEXT = "https://schema.org";
const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const NAUKMA_ID = `${SITE_URL}/#naukma`;

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

/** Google радить для Article три пропорції зображення (16:9, 4:3, 1:1) шириною від 1200 px. */
function imageObjects(base: string): JsonLd[] {
  return (["16x9", "4x3", "1x1"] as OgRatio[]).map((ratio) => ({
    "@type": "ImageObject",
    url: absoluteUrl(`${base}-${ratio}.jpg`),
    width: OG_SIZES[ratio].width,
    height: OG_SIZES[ratio].height,
  }));
}

export function organization(): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    alternateName: ["Fantasm NaUKMA", "Ideas NaUKMA"],
    url: `${SITE_URL}/`,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl(SITE_LOGO),
      width: SITE_LOGO_SIZE,
      height: SITE_LOGO_SIZE,
    },
    description: "Платформа ідей спільноти Києво-Могилянської академії.",
    areaServed: "UA",
    knowsLanguage: SITE_LANGUAGE,
  };
}

export function website(): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "WebSite",
    "@id": SITE_ID,
    name: SITE_NAME,
    alternateName: ["NaUKMA Ideas", "ideas.naukma.com"],
    url: `${SITE_URL}/`,
    inLanguage: SITE_LANGUAGE,
    publisher: organizationRef(),
  };
}

/**
 * Сутність, про яку розділ «Кампус»: допомагає Google звʼязати сторінки з
 * університетом. `sameAs` лише на Вікіпедію, інших офіційних URL не вигадуємо.
 */
export function naukma(): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "CollegeOrUniversity",
    "@id": NAUKMA_ID,
    name: "Національний університет «Києво-Могилянська академія»",
    alternateName: ["НаУКМА", "Києво-Могилянська академія", "NaUKMA"],
    address: NAUKMA_ADDRESS,
    sameAs: ["https://uk.wikipedia.org/wiki/Національний_університет_«Києво-Могилянська_академія»"],
  };
}

/** Вузол самої сторінки: звʼязує крихти, головне зображення і сайт. */
export function webPage({
  path,
  name,
  description,
  base = DEFAULT_OG_BASE,
  type = "WebPage",
  datePublished,
  dateModified,
  breadcrumb = true,
}: {
  path: string;
  name: string;
  description: string;
  base?: string;
  type?: "WebPage" | "CollectionPage" | "ProfilePage";
  datePublished?: string;
  dateModified?: string;
  breadcrumb?: boolean;
}): JsonLd {
  const url = absoluteUrl(path);
  const [primary] = imageObjects(base);
  return {
    "@context": CONTEXT,
    "@type": type,
    "@id": url,
    url,
    name,
    description,
    inLanguage: SITE_LANGUAGE,
    isPartOf: { "@id": SITE_ID },
    primaryImageOfPage: primary,
    ...(breadcrumb ? { breadcrumb: { "@id": `${url}#breadcrumb` } } : {}),
    ...(datePublished ? { datePublished } : {}),
    ...(dateModified ? { dateModified } : {}),
  };
}

/** Один `@graph` на сторінку: `@id` не резолвиться між різними сторінками, тож вузли сайту йдуть у кожну. */
export function graph(items: JsonLd[]): JsonLd {
  const seen = new Set<string>();
  const nodes: JsonLd[] = [];
  for (const item of items) {
    const { "@context": _context, ...node } = item;
    const id = typeof node["@id"] === "string" ? node["@id"] : null;
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    nodes.push(node);
  }
  return { "@context": CONTEXT, "@graph": nodes };
}

export type Crumb = { name: string; path: string };

export function breadcrumbList(crumbs: Crumb[]): JsonLd {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    "@id": `${absoluteUrl(crumbs[crumbs.length - 1]?.path ?? "/")}#breadcrumb`,
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
    mainEntityOfPage: { "@id": url },
    // Google обрізає headline довше 110 символів.
    headline: fm.title.slice(0, 110),
    ...(fm.seoTitle ? { alternativeHeadline: fm.seoTitle } : {}),
    description: fm.description,
    inLanguage: SITE_LANGUAGE,
    datePublished: fm.publishedAt,
    dateModified: fm.updatedAt ?? fm.publishedAt,
    image: imageObjects(ogBase(doc.path, doc.isPillar)),
    thumbnailUrl: absoluteUrl(`${ogBase(doc.path, doc.isPillar)}-16x9.jpg`),
    author: organizationRef(),
    publisher: organizationRef(),
    isPartOf: { "@id": SITE_ID },
    isAccessibleForFree: true,
    articleSection: HUBS[doc.hub].label,
    ...(fm.keywords?.length ? { keywords: fm.keywords.join(", ") } : {}),
    wordCount: doc.words,
    timeRequired: `PT${doc.readingMinutes}M`,
    ...(doc.sources.length ? { citation: doc.sources } : {}),
    ...(doc.hub === "campus" ? { about: { "@id": NAUKMA_ID } } : {}),
  };
}

/** Усі вузли статті чи хабу одним викликом; роути лише додають специфічне (ItemList). */
export function docNodes(doc: DocView): JsonLd[] {
  const fm = doc.frontmatter;
  return compact([
    webPage({
      path: doc.path,
      name: fm.seoTitle ?? fm.title,
      description: fm.description,
      base: ogBase(doc.path, doc.isPillar),
      type: doc.isPillar ? "CollectionPage" : "WebPage",
      datePublished: fm.publishedAt,
      dateModified: fm.updatedAt ?? fm.publishedAt,
    }),
    article(doc),
    breadcrumbList(docCrumbs(doc)),
    doc.hub === "campus" ? naukma() : null,
    faqPage(fm.faq ?? []),
  ]);
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
  return webPage({ path, name, description, type: "CollectionPage" });
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
    image: imageObjects(DEFAULT_OG_BASE).map((image) => image.url as string),
    location: {
      "@type": "Place",
      name: idea.eventLocation || "Національний університет «Києво-Могилянська академія»",
      address: NAUKMA_ADDRESS,
    },
    organizer: { "@type": "Organization", name: idea.author.name, url: `${SITE_URL}/` },
  };
}

function person(author: IdeaAuthor): JsonLd {
  return { "@type": "Person", name: author.name, url: absoluteUrl(`/u/${author.handle}`) };
}

function comment(ideaUrl: string, post: ForumPost): JsonLd[] {
  if (post.deleted) return [];
  return [
    {
      "@type": "Comment",
      "@id": `${ideaUrl}#post-${post.id}`,
      url: `${ideaUrl}#post-${post.id}`,
      text: post.text,
      datePublished: post.createdAt,
      author: person(post.author),
      ...(post.replies.length ? { comment: post.replies.flatMap((reply) => comment(ideaUrl, reply)) } : {}),
    },
  ];
}

/**
 * Ідея з обговоренням під нею. Google показує форумні сторінки окремим блоком, але лише якщо
 * розмітка збігається з видимим: без жодного допису (порожня гілка) вузол не віддаємо зовсім.
 */
export function discussionForumPosting(idea: IdeaView, thread: ForumThread): JsonLd | null {
  if (thread.count === 0) return null;
  const url = absoluteUrl(`/ideas/${idea.slug}`);
  return {
    "@context": CONTEXT,
    "@type": "DiscussionForumPosting",
    "@id": `${url}#discussion`,
    mainEntityOfPage: { "@id": url },
    url,
    headline: idea.title.slice(0, 110),
    text: idea.summary,
    inLanguage: SITE_LANGUAGE,
    datePublished: idea.createdAt,
    ...(idea.updatedAt ? { dateModified: idea.updatedAt } : {}),
    author: person(idea.author),
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/CommentAction",
        userInteractionCount: thread.count,
      },
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: idea.votes,
      },
    ],
    comment: thread.posts.flatMap((post) => comment(url, post)),
  };
}

export function compact(items: (JsonLd | null)[]): JsonLd[] {
  return items.filter((item): item is JsonLd => item !== null);
}
