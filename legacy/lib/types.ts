// Mirrors the Spring API DTOs (ua.naukma.ideas.dto.*).

export type Affiliation = "UKMA_VERIFIED" | "EXTERNAL";
export type Role = "USER" | "MODERATOR" | "ADMIN";
export type IdeaCategory = "STARTUP" | "PROJECT" | "EVENT" | "COMMUNITY" | "OTHER";
export type IdeaStatus = "DRAFT" | "OPEN" | "TEAM_FORMING" | "IN_PROGRESS" | "DONE" | "ARCHIVED";
export type IdeaVisibility = "PUBLIC" | "UKMA_ONLY";
export type ModerationStatus = "PENDING" | "APPROVED" | "HIDDEN" | "REJECTED";
export type ParticipationStatus = "INTERESTED" | "JOINED" | "ACCEPTED" | "DECLINED";
export type FeedSort = "HOT" | "NEW" | "TOP";
export type NotificationType =
  | "IDEA_COMMENTED" | "IDEA_VOTED" | "IDEA_JOINED" | "JOIN_ACCEPTED"
  | "IDEA_APPROVED" | "IDEA_HIDDEN" | "EVENT_REMINDER" | "SYSTEM";

export interface UserSummary {
  id: number;
  handle: string;
  name: string;
  avatarUrl: string | null;
  affiliation: Affiliation;
  faculty: string | null;
  verifiedMohylian: boolean;
}

export interface Me {
  id: number;
  handle: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  affiliation: Affiliation;
  faculty: string | null;
  role: Role;
  karma: number;
  verifiedMohylian: boolean;
  emailEnabled: boolean;
  unreadNotifications: number;
}

export interface Tag {
  slug: string;
  label: string;
}

export interface IdeaCard {
  id: number;
  slug: string;
  title: string;
  summary: string;
  category: IdeaCategory;
  status: IdeaStatus;
  visibility: IdeaVisibility;
  coverUrl: string | null;
  author: UserSummary;
  tags: Tag[];
  votesScore: number;
  votesCount: number;
  commentsCount: number;
  participantsCount: number;
  campus: boolean;
  eventAt: string | null;
  eventLocation: string | null;
  viewerHasVoted: boolean;
  createdAt: string;
}

export interface Participant {
  id: number;
  user: UserSummary;
  role: string | null;
  status: ParticipationStatus;
  createdAt: string;
}

export interface IdeaDetail extends Omit<IdeaCard, "viewerHasVoted"> {
  bodyMd: string;
  moderationStatus: ModerationStatus;
  capacity: number | null;
  needsRoles: string | null;
  participants: Participant[];
  viewerHasVoted: boolean;
  viewerParticipation: Participant | null;
  viewerCanEdit: boolean;
  updatedAt: string;
}

export interface Feed {
  items: IdeaCard[];
  nextCursor: string | null;
}

export interface Comment {
  id: number;
  parentId: number | null;
  author: UserSummary;
  bodyMd: string;
  deleted: boolean;
  createdAt: string;
  replies: Comment[];
}

export interface UserProfile {
  id: number;
  handle: string;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  affiliation: Affiliation;
  faculty: string | null;
  karma: number;
  verifiedMohylian: boolean;
  createdAt: string;
  ideas: IdeaCard[];
}

export interface NotificationItem {
  id: number;
  type: NotificationType;
  message: string;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface VoteResult {
  voted: boolean;
  votesScore: number;
  votesCount: number;
}
