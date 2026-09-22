"use client";

import { useEffect, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/client-api";
import type { Feed } from "@/lib/types";
import { IdeaCard } from "@/components/idea-card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { IlloEmptyFeed } from "@/components/ui/illustrations";
import { Button } from "@/components/ui/button";

export interface FeedParams {
  sort?: string;
  category?: string;
  tag?: string;
  campus?: boolean;
}

function buildQuery(params: FeedParams, cursor?: string): string {
  const q = new URLSearchParams();
  if (params.sort) q.set("sort", params.sort);
  if (params.category) q.set("category", params.category);
  if (params.tag) q.set("tag", params.tag);
  if (params.campus) q.set("campus", "true");
  if (cursor) q.set("cursor", cursor);
  return q.toString();
}

/**
 * Infinite-scrolling idea grid. First page is SSR (no entry animation, good for
 * SEO + CLS); pages fetched on the client `rise-in` with a small stagger.
 */
export function InfiniteFeed({ params, initial }: { params: FeedParams; initial: Feed }) {
  const sentinel = useRef<HTMLDivElement>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, status } = useInfiniteQuery({
    queryKey: ["feed", params],
    queryFn: ({ pageParam }) => api.get<Feed>(`/api/v1/ideas?${buildQuery(params, pageParam)}`),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    initialData: { pages: [initial], pageParams: [undefined] },
  });

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const pages = data?.pages ?? [];
  const total = pages.reduce((n, p) => n + p.items.length, 0);

  if (status === "success" && total === 0) {
    return (
      <EmptyState
        illustration={<IlloEmptyFeed />}
        title="Поки що порожньо"
        description="Тут ще немає ідей за цими фільтрами. Станьте першим, хто поділиться."
        actionHref="/ideas/new"
        actionLabel="Запропонувати ідею"
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {pages.map((page, pageIndex) =>
          page.items.map((idea, i) => (
            <div
              key={idea.id}
              className={pageIndex > 0 ? "rise-in" : undefined}
              style={pageIndex > 0 ? { animationDelay: `${Math.min(i, 6) * 45}ms` } : undefined}
            >
              <IdeaCard idea={idea} />
            </div>
          )),
        )}
      </div>

      {isFetchingNextPage && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      )}

      <div ref={sentinel} />

      {hasNextPage && !isFetchingNextPage && (
        <div className="flex justify-center pt-2">
          <Button variant="secondary" onClick={() => fetchNextPage()}>
            Показати більше
          </Button>
        </div>
      )}
    </div>
  );
}
