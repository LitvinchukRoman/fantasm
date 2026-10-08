import { data, Link, redirect, useFetcher } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { Button } from "~/components/ui/button";
import { ApiError, decideModeration, getCurrentUser, getModerationQueue, routeApi } from "~/lib/api.server";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/moderation";

export const meta = () => noindexSeo({ title: "Модерація, Fantasm", description: "Черга модерації Fantasm.", path: "/moderation" });

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const user = await routeApi(getCurrentUser(request));
  if (!user) throw redirect("/login");
  if (user.role === "USER") throw data("Forbidden", { status: 403 });
  return routeApi(getModerationQueue(request, url.searchParams.get("state") ?? undefined, url.searchParams.get("cursor") ?? undefined));
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  try {
    await decideModeration(request, String(form.get("id")), String(form.get("decision")), String(form.get("note") || "") || undefined);
    return data({ ok: true });
  } catch (error) {
    if (error instanceof ApiError) return data(error.body, { status: error.status });
    throw error;
  }
}

export default function Moderation({ loaderData }: Route.ComponentProps) {
  return <GuideFrame><div className="mx-auto max-w-4xl">
    <h1 className="text-3xl font-semibold">Черга модерації</h1>
    <ul className="mt-8 space-y-5">
      {loaderData.items.map((item) => <ModerationItem key={item.caseId} item={item} />)}
    </ul>
    {loaderData.items.length === 0 && <p className="mt-8 text-[var(--color-text-muted)]">Черга порожня.</p>}
    {loaderData.nextCursor && <Button to={`/moderation?cursor=${encodeURIComponent(loaderData.nextCursor)}`} variant="secondary" className="mt-6">Далі</Button>}
  </div></GuideFrame>;
}

function ModerationItem({ item }: { item: Route.ComponentProps["loaderData"]["items"][number] }) {
  const fetcher = useFetcher<{ error?: string }>();
  return <li className="rounded-[var(--radius-card)] border border-[var(--color-border)] p-5">
    <Link to={`/ideas/${item.slug}`} className="text-xl font-medium hover:text-[var(--color-accent)]">{item.title}</Link>
    <p className="mt-2 text-sm text-[var(--color-text-muted)]">{item.summary}</p>
    <fetcher.Form method="post" className="mt-4 flex flex-wrap gap-2">
      <input type="hidden" name="id" value={item.ideaId} />
      <input name="note" maxLength={1000} placeholder="Примітка для автора" className="min-w-56 flex-1 rounded-lg border border-[var(--color-border)] bg-transparent px-3 py-2 text-sm" />
      {(["APPROVED", "HIDDEN", "REJECTED"] as const).map((decision) => <Button key={decision} type="submit" name="decision" value={decision} size="sm" variant={decision === "APPROVED" ? "primary" : "secondary"}>{decision}</Button>)}
    </fetcher.Form>
    {fetcher.data?.error && <p role="alert" className="mt-2 text-sm text-red-300">{fetcher.data.error}</p>}
  </li>;
}
