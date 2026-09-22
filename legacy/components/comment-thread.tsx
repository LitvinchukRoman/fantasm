"use client";

import { useState } from "react";
import { Link } from "@/lib/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CornerDownRight, Send } from "lucide-react";
import { api, ApiError } from "@/lib/client-api";
import type { Comment } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useMe } from "@/lib/use-me";
import { timeAgo } from "@/lib/format";

export function CommentThread({ ideaId, initial }: { ideaId: number; initial: Comment[] }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [replyTo, setReplyTo] = useState<number | null>(null);

  const { data: comments = initial } = useQuery({
    queryKey: ["comments", ideaId],
    queryFn: () => api.get<Comment[]>(`/api/v1/ideas/${ideaId}/comments`),
    initialData: initial,
  });

  const add = useMutation({
    mutationFn: (vars: { body: string; parentId: number | null }) =>
      api.post<Comment>(`/api/v1/ideas/${ideaId}/comments`, {
        bodyMd: vars.body,
        parentId: vars.parentId,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["comments", ideaId] });
      setReplyTo(null);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 401) window.location.href = "/login";
    },
  });

  const total = comments.reduce((n, c) => n + 1 + c.replies.length, 0);

  return (
    <section id="comments" className="space-y-4">
      <h2 className="text-h2">Обговорення {total > 0 && <span className="text-[color:var(--ink-3)]">· {total}</span>}</h2>

      {me ? (
        <CommentForm onSubmit={(body) => add.mutate({ body, parentId: null })} pending={add.isPending} />
      ) : (
        <Card level={1} className="p-4 text-sm text-[color:var(--ink-2)]">
          <Link href="/login" className="font-medium text-[color:var(--accent-ink)] hover:underline">
            Увійдіть
          </Link>
          , щоб долучитися до обговорення.
        </Card>
      )}

      {comments.length === 0 ? (
        <EmptyState title="Ще немає коментарів" description="Будьте першим, хто висловиться." />
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li key={c.id}>
              <CommentItem comment={c} canReply={!!me} onReply={() => setReplyTo(c.id)} />
              {replyTo === c.id && me && (
                <div className="ml-11 mt-2">
                  <CommentForm
                    autoFocus
                    placeholder={`Відповідь для ${c.author.name}…`}
                    onSubmit={(body) => add.mutate({ body, parentId: c.id })}
                    pending={add.isPending}
                  />
                </div>
              )}
              {c.replies.length > 0 && (
                <ul className="ml-11 mt-2 space-y-2 border-l border-[var(--line)] pl-3">
                  {c.replies.map((r) => (
                    <li key={r.id}>
                      <CommentItem comment={r} canReply={false} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentItem({
  comment,
  canReply,
  onReply,
}: {
  comment: Comment;
  canReply: boolean;
  onReply?: () => void;
}) {
  return (
    <Card level={1} className="p-4">
      <div className="mb-1 flex items-center gap-2">
        <Avatar name={comment.author.name} src={comment.author.avatarUrl} size="sm" />
        <span className="text-sm font-medium">{comment.author.name}</span>
        {comment.author.verifiedMohylian && <VerifiedBadge faculty={comment.author.faculty} size={16} />}
        <span className="text-xs text-[color:var(--ink-3)]">· {timeAgo(comment.createdAt)}</span>
      </div>
      <p className="whitespace-pre-wrap text-sm text-[color:var(--ink)]">
        {comment.deleted ? <em className="text-[color:var(--ink-3)]">коментар видалено</em> : comment.bodyMd}
      </p>
      {canReply && (
        <button
          type="button"
          onClick={onReply}
          className="mt-2 inline-flex items-center gap-1 text-xs text-[color:var(--ink-3)] transition-colors hover:text-[color:var(--accent-ink)]"
        >
          <CornerDownRight className="size-3.5" /> Відповісти
        </button>
      )}
    </Card>
  );
}

function CommentForm({
  onSubmit,
  pending,
  placeholder = "Ваш коментар…",
  autoFocus,
}: {
  onSubmit: (body: string) => void;
  pending: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) onSubmit(body.trim());
        setBody("");
      }}
      className="flex items-end gap-2"
    >
      <textarea
        autoFocus={autoFocus}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        rows={2}
        maxLength={4000}
        className="min-h-11 flex-1 resize-y rounded-xl border border-[var(--line)] bg-[var(--surface-1)] px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-[color:var(--ink-3)] hover:border-[var(--line-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--accent)_45%,transparent)]"
      />
      <Button type="submit" size="icon" disabled={pending || !body.trim()} aria-label="Надіслати">
        <Send className="size-4" />
      </Button>
    </form>
  );
}
