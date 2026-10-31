export type ApiCategory = "STARTUP" | "PROJECT" | "EVENT" | "COMMUNITY" | "VOLUNTEERING" | "OTHER";
export type ApiStatus = "DRAFT" | "OPEN" | "TEAM_FORMING" | "IN_PROGRESS" | "DONE" | "ARCHIVED";
export type ApiVisibility = "PUBLIC" | "MEMBERS_ONLY" | "ORGANIZATION_ONLY";
export type UserRole = "USER" | "MODERATOR" | "ADMIN";
export type Provider = "google" | "entra";

export interface ApiErrorBody {
  error: string;
  code: string;
  fields?: Record<string, string>;
  requestId?: string;
}

export interface Campus {
  id: string;
  label: string;
}

export interface Person {
  handle: string;
  name: string;
}

export interface User extends Person {
  id: string;
  email: string;
  avatarUrl?: string;
  bio?: string;
  github?: string;
  linkedin?: string;
  instagram?: string;
  role: UserRole;
  karma?: number;
  verified?: boolean;
  memberships?: Array<{
    organizationId: string;
    name: string;
    badge?: string;
    capabilities?: string[];
  }>;
  /** false, доки людина не підтвердила імʼя й нікнейм після першого входу. */
  onboarded?: boolean;
  suggestedHandle?: string;
  createdAt: string;
}

export interface IdeaAuthor extends Person {
  verified?: boolean;
  campus?: Campus | null;
}

export interface IdeaCard {
  slug: string;
  title: string;
  summary?: string;
  story?: string;
  coverUrl?: string;
  category: ApiCategory;
  status: ApiStatus;
  moderation?: "PENDING" | "APPROVED" | "HIDDEN" | "REJECTED";
  visibility: ApiVisibility;
  organizationId?: string | null;
  campus?: Campus | null;
  tags?: Array<{ slug: string; label: string }>;
  author: IdeaAuthor;
  votes?: number;
  comments?: number;
  participants?: number;
  createdAt: string;
  updatedAt?: string;
  publishedAt?: string | null;
  eventAt?: string;
  eventLocation?: string;
  eventCapacity?: number;
  needsRoles?: string[];
}

export interface IdeaView extends IdeaCard {
  html?: string;
  text?: string;
  toc?: Array<{ id: string; text: string; level: number }>;
  readingMinutes?: number;
  body?: string;
  canEdit?: boolean;
  viewer?: {
    voted?: boolean;
    votedWeight?: number;
    participation?: { state: "INTERESTED" | "JOINED" | "ACCEPTED" | "DECLINED"; role?: string } | null;
  };
}

export interface Post {
  id: string;
  author: IdeaAuthor;
  createdAt: string;
  updatedAt?: string;
  html?: string;
  text?: string;
  deleted?: boolean;
  replies?: Post[];
}

export interface Participant extends Person {
  state: string;
  role?: string;
  verified?: boolean;
  campus?: Campus | null;
}

export interface Thread {
  id: string;
  ideaSlug: string;
  count: number;
  posts: Post[];
}

export interface PublicProfile extends Person {
  bio?: string;
  github?: string;
  linkedin?: string;
  instagram?: string;
  avatarUrl?: string;
  verified?: boolean;
  campus?: Campus | null;
  role?: UserRole;
  karma?: number;
  joinedAt: string;
  ideasCount?: number;
  ideas?: IdeaCard[];
}

export interface Notification {
  id: string;
  type: "COMMENT" | "VOTE" | "JOIN" | "ACCEPTED" | "APPROVED" | "HIDDEN" | "EVENT_REMINDER" | "SYSTEM";
  payload?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface QueueItem {
  caseId: string;
  ideaId: string;
  slug: string;
  title: string;
  summary?: string;
  category: ApiCategory;
  html?: string;
  author: Person;
  state: "PENDING" | "HIDDEN";
  source: "PREMODERATION" | "REPORTS";
  openedAt: string;
  openReports?: number;
  authorKarma?: number;
  authorApprovedIdeas?: number;
}

export interface AdminPoint {
  day: string;
  value: number;
}

export interface AdminOverview {
  range: "7d" | "30d" | "90d";
  from: string;
  to: string;
  verdict: { status: "growing" | "falling" | "steady" | "insufficient"; score: number; summary: string; reasons: string[] };
  kpis: Array<{ key: string; label: string; value: number; previous: number; delta: number | null }>;
  series: {
    visitors: AdminPoint[];
    pageviews: AdminPoint[];
    activeUsers: AdminPoint[];
    signups: AdminPoint[];
    ideas: AdminPoint[];
    votes: AdminPoint[];
    posts: AdminPoint[];
    participations: AdminPoint[];
    casesOpened: AdminPoint[];
    casesDecided: AdminPoint[];
    decisionSeconds: AdminPoint[];
    httpRequests: AdminPoint[];
    http5xx: AdminPoint[];
  };
  funnel: { visitors: number; signedIn: number; acted: number; authors: number };
  retention: Array<{ week: string; size: number; rates: Array<number | null> }>;
  breakdowns: {
    pages: Array<{ key: string; value: number }>;
    referrers: Array<{ key: string; value: number }>;
    categories: Array<{ key: string; value: number }>;
  };
  topIdeas: Array<{ slug: string; title: string; views: number; votes: number; posts: number; joins: number }>;
  insights: Array<{ kind: string; text: string }>;
  health: AdminHealth;
}

export interface AdminHealth {
  status: "ok" | "degraded" | "down";
  reasons: string[];
  uptimeSeconds: number;
  ready: boolean;
  dbPingMs: number;
  dbPool: { acquired: number; idle: number; max: number };
  jobs: Array<{ name: string; at: string; durationMs: number; failed: boolean; error: string }>;
  hour: { requests: number; serverErrors: number; p95Ms: number };
  day: { requests: number; serverErrors: number; p95Ms: number };
  oldestQueueHours: number;
}

export interface AdminUser {
  handle: string;
  name: string;
  email: string;
  role: UserRole;
  badge: string | null;
  karma: number;
  approvedIdeas: number;
  createdAt: string;
  lastSeenAt: string | null;
  protected: boolean;
}

export interface ModerationHistoryItem {
  caseId: string;
  ideaId: string;
  slug: string;
  title: string;
  decision: string;
  note: string;
  source: string;
  decidedAt: string;
  decidedBy: Person;
}

export interface ModerationReport {
  reporter: Person;
  reason: string;
  status: string;
  createdAt: string;
}

export interface IdeaCreate {
  title: string;
  summary?: string;
  body?: string;
  category: ApiCategory;
  tags?: string[];
  visibility?: ApiVisibility;
  organizationId?: string;
  status?: "DRAFT" | "OPEN";
  eventAt?: string;
  eventLocation?: string;
  eventCapacity?: number;
  needsRoles?: string[];
}

/** Плани й спонсорство (backend/internal/billing, тег `billing` у swagger.yaml). Суми в копійках. */
export type PlanCode = "FREE" | "PLUS" | "PRO";
export type SponsorTier = "SUPPORTER" | "BACKER" | "PATRON";
export type SubscriptionStatus = "ACTIVE" | "CANCELED";

export interface Plan {
  code: PlanCode;
  name: string;
  priceMinor: number;
  /** null — без ліміту. */
  activeIdeas: number | null;
  perks: string[];
}

export interface Tier {
  code: SponsorTier;
  name: string;
  priceMinor: number;
  perks: string[];
}

export interface BillingCatalog {
  currency: "UAH";
  /** Оплата імітована: картку не беремо. */
  mock: boolean;
  plans: Plan[];
  tiers: Tier[];
}

export interface PlanState extends Plan {
  status: SubscriptionStatus | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface Sponsorship {
  id: string;
  idea: { slug: string; title: string };
  tier: SponsorTier;
  tierName: string;
  priceMinor: number;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  since: string;
}

export interface Payment {
  id: string;
  kind: "PLAN" | "SPONSORSHIP";
  amountMinor: number;
  currency: "UAH";
  status: "SUCCEEDED" | "REFUNDED";
  description: string;
  createdAt: string;
  refundedAt: string | null;
}

export interface BillingOverview {
  mock: boolean;
  currency: "UAH";
  plan: PlanState;
  usage: { activeIdeas: number; limit: number | null };
  sponsorships: Sponsorship[];
  payments: Payment[];
}

export interface IdeaSponsorship {
  sponsors: number;
  accepting: boolean;
  own: boolean;
  mine: Sponsorship | null;
  /** Лише автору й staff. */
  supporters?: { handle: string; name: string; tier: SponsorTier; since: string }[];
  monthlyMinor?: number;
}
