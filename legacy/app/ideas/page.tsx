import type { Metadata } from "next";
import { getFeed } from "@/lib/api";
import { FeedControls } from "@/components/feed-controls";
import { InfiniteFeed } from "@/components/infinite-feed";
import type { Feed, FeedSort } from "@/lib/types";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Усі ідеї",
  description: "Гарячі, нові та найкращі ідеї, стартапи й події спільноти НаУКМА.",
  alternates: { canonical: "/ideas" },
};

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; category?: string; tag?: string; campus?: string }>;
}) {
  const sp = await searchParams;
  const params = {
    sort: (sp.sort as FeedSort) ?? "HOT",
    category: sp.category,
    tag: sp.tag,
    campus: sp.campus === "true",
  };

  const feed = (await getFeed(params)) ?? ({ items: [], nextCursor: null } as Feed);

  return (
    <div className="space-y-6 pb-10">
      <div>
        <h1 className="text-h1">Ідеї</h1>
        <p className="mt-1 text-[color:var(--ink-2)]">
          {sp.tag ? `Тег #${sp.tag}` : "Усе, що зараз обговорює спільнота"}
        </p>
      </div>

      <FeedControls />

      {/* key remounts the client feed when filters change so paging resets */}
      <InfiniteFeed key={JSON.stringify(params)} params={params} initial={feed} />
    </div>
  );
}
