import { Link, useFetcher, useRouteLoaderData } from "react-router";
import { useCallback, useEffect, useState } from "react";
import { GuideMarkdown } from "~/components/guides/markdown";
import { Button } from "~/components/ui/button";
import { track } from "~/lib/analytics";
import { RelativeTime } from "~/components/ui/relative-time";
import { AuthorLink, useAuthorAvatar } from "~/components/idea/author-popover";
import { NaukmaMark } from "~/components/ui/naukma-mark";
import { UserAvatar } from "~/components/ui/user-avatar";
import { FORUM_MAX_DEPTH, type ForumPost, type ForumThread } from "~/lib/forum";
import type { RootData } from "~/root";

function Avatar({ name, handle }: { name: string; handle?: string }) {
  const src = useAuthorAvatar(handle ?? "");
  return <UserAvatar name={name} src={handle ? src : undefined} className="size-8 text-sm" />;
}

const POST_ERRORS: Record<string, string> = {
  not_found: "Обговорення цієї ідеї зараз закрите.",
  unauthorized: "Сесія завершилась. Увійдіть ще раз, текст допису збережеться тут.",
  rate_limited: "Забагато дописів поспіль. Спробуйте за хвилину.",
  validation_failed: "Допис порожній або задовгий (до 5000 символів).",
};

type PostResult = { error?: string; code?: string };

function postError(data: PostResult | undefined) {
  return data?.error ? (data.code && POST_ERRORS[data.code]) || data.error : null;
}

/** Відповідь на конкретний допис: той самий `intent=post`, що й новий допис, плюс `parentId`. */
function ReplyForm({ post, onDone }: { post: ForumPost; onDone: () => void }) {
  const fetcher = useFetcher<PostResult>();
  const [body, setBody] = useState("");
  const failed = postError(fetcher.data);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error) onDone();
  }, [fetcher.state, fetcher.data, onDone]);

  return (
    <fetcher.Form method="post" className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4">
      <input type="hidden" name="intent" value="post" />
      <input type="hidden" name="parentId" value={post.id} />
      <textarea
        name="body"
        required
        autoFocus
        maxLength={5000}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onDone();
        }}
        rows={2}
        placeholder={`Відповідь для ${post.author.name}…`}
        aria-label={`Відповідь для ${post.author.name}`}
        className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm"
      />
      {failed ? <p role="alert" className="mt-2 text-sm text-red-300">{failed}</p> : null}
      <div className="mt-3 flex items-center gap-3">
        <Button type="submit" size="sm" disabled={fetcher.state !== "idle" || !body.trim()}>
          {fetcher.state === "idle" ? "Відповісти" : "Публікуємо…"}
        </Button>
        <button type="button" onClick={onDone} className="hud-label py-2 transition-colors hover:!text-[var(--color-text)]">
          Скасувати
        </button>
      </div>
    </fetcher.Form>
  );
}

type ReplyState = {
  /** null: відповідати не можна (обговорення закрите). "login": спершу увійти. */
  mode: "reply" | "login" | null;
  openId: string | null;
  open: (id: string) => void;
  close: () => void;
};

function Post({ post, depth, isIdeaAuthor, reply }: { post: ForumPost; depth: number; isIdeaAuthor: (handle: string) => boolean; reply: ReplyState }) {
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
              <Avatar name={post.author.name} handle={post.author.handle} />
              <AuthorLink handle={post.author.handle} className="text-sm font-medium text-[var(--color-text)] hover:underline">
                {post.author.name}
              </AuthorLink>
              {post.author.verified && <NaukmaMark className="naukma-mark--xs" />}
              {isIdeaAuthor(post.author.handle) && (
                <span className="hud-label !text-[var(--color-accent)]">Автор ідеї</span>
              )}
              <RelativeTime iso={post.createdAt} className="hud-label" />
            </header>
            <div className="mt-3 sm:pl-11">
              <GuideMarkdown html={post.html} />
              {reply.mode === "login" && (
                <Link
                  to="/login"
                  prefetch="intent"
                  className="hud-label mt-1 -mb-2 inline-block py-2 transition-colors hover:!text-[var(--color-text)]"
                >
                  Відповісти
                </Link>
              )}
              {reply.mode === "reply" && reply.openId !== post.id && (
                <button
                  type="button"
                  onClick={() => reply.open(post.id)}
                  className="hud-label mt-1 -mb-2 inline-block py-2 transition-colors hover:!text-[var(--color-text)]"
                >
                  Відповісти
                </button>
              )}
              {reply.mode === "reply" && reply.openId === post.id && <ReplyForm post={post} onDone={reply.close} />}
            </div>
          </>
        )}
      </article>
      {post.replies.length > 0 && (
        <ol className={nested ? "ml-4 border-l border-[var(--color-border)] pl-4 sm:ml-5 sm:pl-6" : ""}>
          {post.replies.map((child) => (
            <Post key={child.id} post={child} depth={depth + 1} isIdeaAuthor={isIdeaAuthor} reply={reply} />
          ))}
        </ol>
      )}
    </li>
  );
}

/**
 * Одна гілка обговорення під ідеєю. Дописи рендеряться сервером, тож це видима для пошуку частина
 * сторінки (її описує DiscussionForumPosting). Писати й відповідати можна лише після входу.
 */
export function Forum({ thread, authorHandle, closed }: { thread: ForumThread; authorHandle: string; closed?: string }) {
  const root = useRouteLoaderData<RootData>("root");
  const fetcher = useFetcher<PostResult>();
  const [body, setBody] = useState("");
  const [openReply, setOpenReply] = useState<string | null>(null);
  const closeReply = useCallback(() => setOpenReply(null), []);
  const isIdeaAuthor = (handle: string) => handle === authorHandle;
  const failed = postError(fetcher.data);
  const reply: ReplyState = {
    mode: closed ? null : root?.currentUser ? "reply" : "login",
    openId: openReply,
    open: setOpenReply,
    close: closeReply,
  };

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data && !fetcher.data.error) setBody("");
  }, [fetcher.state, fetcher.data]);

  return (
    <div>
      <p className="max-w-xl text-[var(--color-text-muted)]">
        Тут домовляються про ролі, час і формат. Обговорення лишається біля ідеї, а не в чаті, який потім ніхто не знайде.
      </p>

      {closed ? (
        <p className="mt-6 rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-strong)] p-4 text-sm text-[var(--color-text-muted)] sm:p-5">
          {closed}
        </p>
      ) : root?.currentUser ? (
        <fetcher.Form method="post" className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
          <input type="hidden" name="intent" value="post" />
          <textarea name="body" required maxLength={5000} value={body} onChange={(event) => setBody(event.target.value)} rows={3} placeholder="Напишіть допис…" className="w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-sm" />
          {failed ? <p role="alert" className="mt-2 text-sm text-red-300">{failed}</p> : null}
          <Button type="submit" size="sm" className="mt-3" disabled={fetcher.state !== "idle" || !body.trim()}>
            {fetcher.state === "idle" ? "Опублікувати" : "Публікуємо…"}
          </Button>
        </fetcher.Form>
      ) : (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
          <p className="text-sm text-[var(--color-text-muted)]">Щоб написати допис або відповісти, увійди.</p>
          <Button to="/login" size="sm" onClick={() => track("ui.click", { target: "login" })}>Увійти й написати</Button>
        </div>
      )}

      {thread.posts.length === 0 ? (
        !closed && (
          <div className="mt-8 border-y border-dashed border-[var(--color-border-strong)] py-12 text-center">
            <p className="text-[var(--color-text)]">Тут ще тихо</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--color-text-muted)]">
              Запитай про ролі, час або формат. Перший допис визначає тон усієї розмови.
            </p>
          </div>
        )
      ) : (
        <ol className="mt-4 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {thread.posts.map((post) => (
            <Post key={post.id} post={post} depth={1} isIdeaAuthor={isIdeaAuthor} reply={reply} />
          ))}
        </ol>
      )}
    </div>
  );
}
