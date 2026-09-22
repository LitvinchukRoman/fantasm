import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/link";
import { getPublicFeed } from "@/lib/api";
import { IdeaCard } from "@/components/idea-card";
import { Button } from "@/components/ui/button";

/**
 * Fresh, unique-to-us content at the end of a guide: live cards pulled from the
 * product by tag/category. This is what competitors can't copy — and the
 * "learn → do" bridge into the app.
 */
export async function LiveEvents({
  title,
  tag,
  category,
  ctaHref = "/ideas/new",
  ctaLabel = "Створити своє",
}: {
  title?: string;
  tag?: string;
  category?: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  const feed = await getPublicFeed({ tag, category, sort: "HOT", size: 3 });
  const items = feed?.items ?? [];

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <h2 className="text-h2">{title ?? "Зараз у спільноті"}</h2>
        <Link
          href={tag ? `/ideas?tag=${tag}` : category === "EVENT" ? "/events" : "/ideas"}
          className="inline-flex items-center gap-1 text-sm font-medium text-[color:var(--accent-ink)] hover:underline"
        >
          Усі <ArrowRight className="size-4" />
        </Link>
      </div>

      {items.length > 0 ? (
        <div className="grid gap-4">
          {items.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-1)] p-6 text-center">
          <p className="text-[color:var(--ink-2)]">Тут з&apos;являться живі ідеї спільноти за цією темою.</p>
        </div>
      )}

      <Button asChild variant="secondary">
        <Link href={ctaHref}>{ctaLabel}</Link>
      </Button>
    </section>
  );
}
