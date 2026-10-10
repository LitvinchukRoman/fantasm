import type { IdeaCard } from "~/lib/ideas";

export interface UserProfile {
  handle: string;
  name: string;
  bio: string;
  faculty?: string;
  verified: boolean;
  role: "USER" | "MODERATOR" | "ADMIN";
  karma: number;
  joinedAt: string;
}

const USERS: UserProfile[] = [
  {
    handle: "naukma-ideas",
    name: "NaUKMA Ideas",
    bio: "Редакційний акаунт платформи. Публікуємо зразки та важливі анонси.",
    faculty: "ФІ",
    verified: true,
    role: "ADMIN",
    karma: 999,
    joinedAt: "2026-09-01T12:00:00.000Z",
  },
  {
    handle: "student123",
    name: "Звичайний Студент",
    bio: "Шукаю команду для стартапу.",
    verified: false,
    role: "USER",
    karma: 15,
    joinedAt: "2026-09-10T10:00:00.000Z",
  },
  {
    handle: "hacker_bob",
    name: "Кібер Боб",
    bio: "Пишу код, ламаю стереотипи. C++ / Rust ентузіаст.",
    faculty: "ФІ",
    verified: false,
    role: "USER",
    karma: 128,
    joinedAt: "2026-09-05T14:30:00.000Z",
  },
  {
    handle: "design_guru",
    name: "Марія Дизайн",
    bio: "Бруталізм у серці, Figma в руках.",
    faculty: "ФГН",
    verified: true,
    role: "MODERATOR",
    karma: 512,
    joinedAt: "2026-08-20T09:15:00.000Z",
  },
];

export function getUserProfile(handle: string): UserProfile | null {
  return USERS.find((u) => u.handle === handle) ?? null;
}

/** Те, що потрібно попапу профілю на сторінці ідеї: без тіл ідей, лише назви останніх трьох. */
export interface AuthorPreview {
  handle: string;
  name: string;
  bio: string;
  faculty?: string;
  avatarUrl?: string;
  verified: boolean;
  karma: number;
  joinedAt: string;
  ideasCount: number;
  ideas: { slug: string; title: string }[];
}

export function getAuthorPreview(
  handle: string,
  cards: IdeaCard[],
): AuthorPreview | null {
  const profile = getUserProfile(handle);
  if (!profile) return null;
  const own = cards.filter((card) => card.author.handle === handle);
  return {
    handle: profile.handle,
    name: profile.name,
    bio: profile.bio,
    faculty: profile.faculty,
    verified: profile.verified,
    karma: profile.karma,
    joinedAt: profile.joinedAt,
    ideasCount: own.length,
    ideas: own.slice(0, 3).map(({ slug, title }) => ({ slug, title })),
  };
}
