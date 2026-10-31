import { api, ApiError } from "~/lib/api.server";
import type { BillingCatalog, BillingOverview, IdeaSponsorship, PlanCode, SponsorTier } from "~/lib/api-types";

export const getBillingCatalog = (request: Request) => api<BillingCatalog>(request, "/api/billing/plans");

export const getBilling = (request: Request) => api<BillingOverview>(request, "/api/me/billing");

export const choosePlan = (request: Request, plan: Exclude<PlanCode, "FREE">) =>
  api<BillingOverview>(request, "/api/me/billing/plan", { method: "PUT", body: JSON.stringify({ plan }) });

export const cancelPlan = (request: Request) => api<BillingOverview>(request, "/api/me/billing/plan", { method: "DELETE" });

export const cancelSponsorship = (request: Request, id: string) =>
  api<BillingOverview>(request, `/api/me/billing/sponsorships/${encodeURIComponent(id)}`, { method: "DELETE" });

export const getIdeaSponsorship = (request: Request, slug: string) =>
  api<IdeaSponsorship>(request, `/api/ideas/${encodeURIComponent(slug)}/sponsorship`);

export const sponsorIdea = (request: Request, slug: string, tier: SponsorTier) =>
  api<IdeaSponsorship>(request, `/api/ideas/${encodeURIComponent(slug)}/sponsorship`, {
    method: "PUT",
    body: JSON.stringify({ tier }),
  });

/**
 * Підписки — додаткова частина сторінки: якщо білінг недоступний (старший бекенд, збій),
 * сторінка все одно відкривається, просто без цього блоку. 401 і 404 — теж не помилка сторінки.
 */
export async function optional<T>(task: Promise<T>): Promise<T | null> {
  try {
    return await task;
  } catch (error) {
    if (error instanceof ApiError) return null;
    throw error;
  }
}
