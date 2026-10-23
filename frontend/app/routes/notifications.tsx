import { data, Link, redirect, useFetcher } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { BrowserNotifications } from "~/components/push/browser-notifications";
import { Button } from "~/components/ui/button";
import { ApiError, getCurrentUser, getNotifications, markNotificationsRead, routeApi } from "~/lib/api.server";
import { eventTime, formatShortDate } from "~/lib/ideas";
import { describeNotification } from "~/lib/notifications";
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
        <BrowserNotifications />
        {loaderData.items.length === 0 ? <p className="mt-8 text-[var(--color-text-muted)]">Нових сповіщень немає.</p> : (
          <ul className="mt-8 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
            {loaderData.items.map((item) => {
              const slug = typeof item.payload?.ideaSlug === "string" ? item.payload.ideaSlug : null;
              const { before, title, after, note } = describeNotification(item);
              const quoted = title && `«${title}»`;
              return <li key={item.id} className={item.read ? "py-4 opacity-60" : "py-4"}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p>
                      {before}
                      {quoted && (slug ? <Link className="font-medium hover:text-[var(--color-accent)]" to={`/ideas/${slug}`}>{quoted}</Link> : <span className="font-medium">{quoted}</span>)}
                      {after}
                    </p>
                    {note && <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">Примітка модератора: {note}</p>}
                    <time dateTime={item.createdAt} className="mt-1.5 block text-xs text-[var(--color-text-faint)]">{formatShortDate(item.createdAt)}, {eventTime(item.createdAt)}</time>
                  </div>
                  {!item.read && <fetcher.Form method="post"><input type="hidden" name="id" value={item.id} /><button className="shrink-0 text-xs text-[var(--color-text-muted)]">Прочитано</button></fetcher.Form>}
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
