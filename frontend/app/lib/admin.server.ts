import { data, redirect } from "react-router";
import { getCurrentUser, routeApi } from "~/lib/api.server";
import type { User } from "~/lib/api-types";

/** Anonymous visitors go to login. Regular users get 403. Moderators never see the admin panel. */
export async function requireAdmin(request: Request, allowModerator = false): Promise<User> {
  const user = await routeApi(getCurrentUser(request));
  const next = new URL(request.url).pathname;
  if (!user) throw redirect(`/login?next=${encodeURIComponent(next)}`);
  if (user.role === "USER") throw data("Forbidden", { status: 403 });
  if (user.role === "MODERATOR" && !allowModerator) throw redirect("/moderation");
  return user;
}
