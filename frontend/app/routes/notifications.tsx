import { data, Link, redirect, useFetcher } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { Button } from "~/components/ui/button";
import { ApiError, getCurrentUser, getNotifications, markNotificationsRead, routeApi } from "~/lib/api.server";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/notifications";

export const meta = () => noindexSeo({ title: "Сповіщення, Fantasm", description: "Ваші сповіщення у Fantasm.", path: "/notifications" });

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const user = await routeApi(getCurrentUser(request));
  if (!user) throw redirect("/login");
  return routeApi(getNotifications(request, url.searchParams.get("cursor") ?? undefined, url.searchParams.get("unread") === "true"));
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  try {
    const id = String(form.get("id") ?? "");
    return data(await markNotificationsRead(request, id ? [id] : undefined));
  } catch (error) {
    if (error instanceof ApiError) return data(error.body, { status: error.status });
    throw error;
  }
}

export default function Notifications({ loaderData }: Route.ComponentProps) {
  const fetcher = useFetcher();
  return (
    <GuideFrame>
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold">Сповіщення</h1>
          {loaderData.unread > 0 && (
            <fetcher.Form method="post"><Button type="submit" size="sm" variant="secondary">Прочитати всі</Button></fetcher.Form>
          )}
        </div>
        {loaderData.items.length === 0 ? <p className="mt-8 text-[var(--color-text-muted)]">Нових сповіщень немає.</p> : (
          <ul className="mt-8 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
            {loaderData.items.map((item) => {
              const slug = typeof item.payload?.ideaSlug === "string" ? item.payload.ideaSlug : null;
              const title = typeof item.payload?.ideaTitle === "string" ? item.payload.ideaTitle : item.type;
              return <li key={item.id} className={item.read ? "py-4 opacity-60" : "py-4"}>
                <div className="flex items-center justify-between gap-4">
                  {slug ? <Link className="hover:text-[var(--color-accent)]" to={`/ideas/${slug}`}>{title}</Link> : <span>{title}</span>}
                  {!item.read && <fetcher.Form method="post"><input type="hidden" name="id" value={item.id} /><button className="text-xs text-[var(--color-text-muted)]">Прочитано</button></fetcher.Form>}
                </div>
              </li>;
            })}
          </ul>
        )}
        {loaderData.nextCursor && <Button to={`/notifications?cursor=${encodeURIComponent(loaderData.nextCursor)}`} variant="secondary" className="mt-6">Далі</Button>}
      </div>
    </GuideFrame>
  );
}
