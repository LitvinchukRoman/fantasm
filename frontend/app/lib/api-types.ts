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
  faculty?: string;
  role: UserRole;
  karma?: number;
  verified?: boolean;
  memberships?: Array<{
    organizationId: string;
    name: string;
    badge?: string;
    capabilities?: string[];
  }>;
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
  faculty?: string;
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
}

export interface IdeaCreate {
  title: string;
  summary?: string;
  body?: string;
  category: ApiCategory;
  tags?: string[];
  visibility?: ApiVisibility;
  status?: "DRAFT" | "OPEN";
  eventAt?: string;
  eventLocation?: string;
  eventCapacity?: number;
  needsRoles?: string[];
}
