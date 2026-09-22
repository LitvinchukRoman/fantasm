import type { IdeaCard, IdeaDetail } from "./types";

export interface Momentum {
  label: string;
  tone: "accent" | "seal" | "neutral";
  /** 0–100 fill for the meter. */
  pct: number;
}

/**
 * Turns raw engagement into a human "moment" — the narrative the product tells
 * on an idea. Deterministic (no randomness), so SSR and client agree.
 */
export function momentum(idea: IdeaCard | IdeaDetail): Momentum {
  const ageHours = Math.max(
    3,
    (Date.now() - new Date(idea.createdAt).getTime()) / 36e5,
  );
  const weight = idea.votesScore + idea.commentsCount * 1.5 + idea.participantsCount * 2;
  const velocity = weight / ageHours;
  const pct = Math.min(100, Math.round(velocity * 22));

  if (idea.status === "TEAM_FORMING" || idea.participantsCount >= 3) {
    return { label: "Формується команда", tone: "seal", pct: Math.max(pct, 55) };
  }
  if (velocity >= 2) return { label: "Гаряча", tone: "accent", pct: Math.max(pct, 72) };
  if (velocity >= 0.6) return { label: "Набирає обертів", tone: "accent", pct: Math.max(pct, 40) };
  return { label: "Свіжа ідея", tone: "neutral", pct: Math.max(pct, 14) };
}
