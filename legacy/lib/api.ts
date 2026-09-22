import { cookies } from "next/headers";
import type {
  Comment,
  Feed,
  FeedSort,
  IdeaCard,
  IdeaDetail,
  Me,
  UserProfile,
} from "./types";

/**
 * Server-side API access. Public reads are fetched anonymously and cached
 * (good for SEO + ISR); when a session cookie is present we fetch fresh with the
 * Bearer token so verified Mohylians see UKMA_ONLY content and viewer flags.
 */
export const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8080";
export const ACCESS_COOKIE = "access_token";

type NextFetchOpts = { revalidate?: number; tags?: string[] };

async function accessToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

/** Anonymous, cacheable GET — used for crawlable public content. Network/5xx
 * failures degrade to null so an unreachable API (e.g. during a build-time
 * prerender) yields an empty page that ISR later fills, rather than a hard fail. */
async function publicGet<T>(path: string, opts: NextFetchOpts = {}): Promise<T | null> {
  try {
    const res = await fetch(`${API_ORIGIN}${path}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: opts.revalidate ?? 60, tags: opts.tags },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`GET ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error(`GET ${path} failed`, e);
    return null;
  }
}

/** Authenticated, uncached GET — includes viewer-specific data. */
async function authedGet<T>(path: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_ORIGIN}${path}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error(`GET ${path} → ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error(`GET ${path} failed`, e);
    return null;
  }
}

/** Public when anonymous (cached), personalized when logged in. */
async function smartGet<T>(path: string, opts: NextFetchOpts = {}): Promise<T | null> {
  const token = await accessToken();
  return token ? authedGet<T>(path, token) : publicGet<T>(path, opts);
}

// ── feed & ideas ──

export function getFeed(params: {
  sort?: FeedSort;
  category?: string;
  tag?: string;
  campus?: boolean;
  cursor?: string;
  size?: number;
}): Promise<Feed | null> {
  const q = new URLSearchParams();
  if (params.sort) q.set("sort", params.sort);
  if (params.category) q.set("category", params.category);
  if (params.tag) q.set("tag", params.tag);
  if (params.campus) q.set("campus", "true");
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.size) q.set("size", String(params.size));
  return smartGet<Feed>(`/api/v1/ideas?${q.toString()}`, { revalidate: 60, tags: ["feed"] });
}

/** Anonymous, cacheable feed — for static/ISR pages (e.g. SEO guides) that must
 * not read the session cookie (which would force dynamic rendering). */
export function getPublicFeed(params: {
  sort?: FeedSort;
  category?: string;
  tag?: string;
  size?: number;
}): Promise<Feed | null> {
  const q = new URLSearchParams();
  if (params.sort) q.set("sort", params.sort);
  if (params.category) q.set("category", params.category);
  if (params.tag) q.set("tag", params.tag);
  if (params.size) q.set("size", String(params.size));
  return publicGet<Feed>(`/api/v1/ideas?${q.toString()}`, { revalidate: 300, tags: ["feed"] });
}

export function getIdea(slug: string): Promise<IdeaDetail | null> {
  return smartGet<IdeaDetail>(`/api/v1/ideas/${encodeURIComponent(slug)}`, {
    revalidate: 60,
    tags: [`idea:${slug}`],
  });
}

export function getComments(ideaId: number): Promise<Comment[] | null> {
  return smartGet<Comment[]>(`/api/v1/ideas/${ideaId}/comments`, { revalidate: 30 });
}

export function getEvents(): Promise<IdeaCard[] | null> {
  return publicGet<IdeaCard[]>(`/api/v1/events`, { revalidate: 120, tags: ["events"] });
}

export function getUserProfile(handle: string): Promise<UserProfile | null> {
  return smartGet<UserProfile>(`/api/v1/users/${encodeURIComponent(handle)}`, { revalidate: 120 });
}

export async function getMe(): Promise<Me | null> {
  const token = await accessToken();
  if (!token) return null;
  try {
    return await authedGet<Me>(`/api/auth/me`, token);
  } catch {
    return null;
  }
}

/** All public idea slugs (with real dates) for the sitemap. */
export async function getSitemapSlugs(): Promise<{ slug: string; lastModified: string }[]> {
  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/ideas?size=50&sort=NEW`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const feed = (await res.json()) as Feed;
    return feed.items.map((i) => ({ slug: i.slug, lastModified: i.createdAt }));
  } catch {
    return [];
  }
}
