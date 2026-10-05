/**
 * Клієнтська частина форуму під ідеєю: типи й невеликі хелпери. Дані та рендер markdown
 * живуть у forum.server.ts. Одна гілка на ідею: `ForumThread.id` лишає місце для окремих тем
 * пізніше, без зміни URL (`/ideas/:slug#discussion`).
 */
import type { IdeaAuthor } from "./ideas";

export type ForumPost = {
  id: string;
  author: IdeaAuthor;
  createdAt: string;
  /** Готовий HTML допису (markdown відрендерено на сервері). Порожній, якщо допис видалено. */
  html: string;
  /** Той самий текст без розмітки, для JSON-LD і чорнових підписів. */
  text: string;
  deleted: boolean;
  replies: ForumPost[];
};

export type ForumThread = {
  id: string;
  ideaSlug: string;
  /** Усі дописи разом з відповідями, без видалених. */
  count: number;
  posts: ForumPost[];
};

/** Глибина вкладеності, глибше відповіді показуємо на тому ж рівні, щоб лист не їхав вправо. */
export const FORUM_MAX_DEPTH = 3;

export function countPosts(posts: ForumPost[]): number {
  return posts.reduce((sum, post) => sum + (post.deleted ? 0 : 1) + countPosts(post.replies), 0);
}
