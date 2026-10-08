import { Link, useFetcher, useRouteLoaderData } from "react-router";
import { useState } from "react";
import { GuideMarkdown } from "~/components/guides/markdown";
import { Button } from "~/components/ui/button";
import { RelativeTime } from "~/components/ui/relative-time";
import { AuthorLink } from "~/components/idea/author-popover";
import { VerifiedSeal } from "~/components/ui/verified-seal";
import { FORUM_MAX_DEPTH, type ForumPost, type ForumThread } from "~/lib/forum";
import type { RootData } from "~/root";

function Avatar({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] text-sm text-[var(--color-text)]"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function Post({ post, depth, isIdeaAuthor }: { post: ForumPost; depth: number; isIdeaAuthor: (handle: string) => boolean }) {
  // Глибше за ліміт відповіді лишаються на тому ж рівні: лист не їде за край екрана.
  const nested = depth < FORUM_MAX_DEPTH;
  return (
    <li id={`post-${post.id}`} className="scroll-mt-28">
      <article className="py-5">
        {post.deleted ? (
          <p className="flex items-center gap-3 text-sm text-[var(--color-text-faint)] italic">
            <Avatar name="?" />
            Допис видалено
          </p>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Avatar name={post.author.name} />
              <AuthorLink handle={post.author.handle} className="text-sm font-medium text-[var(--color-text)] hover:underline">
                {post.author.name}
              </AuthorLink>
              {post.author.verified && <VerifiedSeal compact />}
              {isIdeaAuthor(post.author.handle) && (
                <span className="hud-label !text-[var(--color-accent)]">Автор ідеї</span>
              )}
              <RelativeTime iso={post.createdAt} className="hud-label" />
            </header>
            <div className="mt-3 sm:pl-11">
              <GuideMarkdown html={post.html} />
              <Link
                to="/login"
                prefetch="intent"
                className="hud-label mt-1 -mb-2 inline-block py-2 transition-colors hover:!text-[var(--color-text)]"
              >
                Відповісти
              </Link>
            </div>
          </>
        )}
      </article>
      {post.replies.length > 0 && (
        <ol className={nested ? "ml-4 border-l border-[var(--color-border)] pl-4 sm:ml-5 sm:pl-6" : ""}>
          {post.replies.map((reply) => (
            <Post key={reply.id} post={reply} depth={depth + 1} isIdeaAuthor={isIdeaAuthor} />
          ))}
        </ol>
      )}
    </li>
  );
}

/**
 * Одна гілка обговорення під ідеєю. Дописи рендеряться сервером, тож це видима для пошуку частина
 * сторінки (її описує DiscussionForumPosting). Писати можна лише після входу, поки немає Go-API.
 */
export function Forum({ thread, authorHandle }: { thread: ForumThread; authorHandle: string }) {
  const root = useRouteLoaderData<RootData>("root");
  const fetcher = useFetcher<{ error?: string }>();
  const [body, setBody] = useState("");
  const isIdeaAuthor = (handle: string) => handle === authorHandle;
  return (
    <div>
      <p className="max-w-xl text-[var(--color-text-muted)]">
        Тут домовляються про ролі, час і формат. Обговорення лишається біля ідеї, а не в чаті, який потім ніхто не знайде.
      </p>

      {root?.currentUser ? (
        <fetcher.Form method="post" className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5" onSubmit={() => setBody("")}>
          <input type="hidden" name="intent" value="post" />
          <textarea name="body" required maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} rows={3} placeholder="Напишіть допис…" className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm" />
          {fetcher.data?.error ? <p role="alert" className="mt-2 text-sm text-red-300">{fetcher.data.error}</p> : null}
          <Button type="submit" size="sm" className="mt-3" disabled={fetcher.state !== "idle" || !body.trim()}>Опублікувати</Button>
        </fetcher.Form>
      ) : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
          <p className="text-sm text-[var(--color-text-muted)]">Щоб написати допис або відповісти, увійди.</p>
          <Button to="/login" size="sm">Увійти й написати</Button>
        </div>
      )}

      {thread.posts.length === 0 ? (
        <div className="mt-8 border-y border-dashed border-[var(--color-border-strong)] py-12 text-center">
          <p className="text-[var(--color-text)]">Тут ще тихо</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">
            Запитай про ролі, час або формат. Перший допис визначає тон усієї розмови.
          </p>
        </div>
      ) : (
        <ol className="mt-4 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {thread.posts.map((post) => (
            <Post key={post.id} post={post} depth={1} isIdeaAuthor={isIdeaAuthor} />
          ))}
        </ol>
      )}
    </div>
  );
}
