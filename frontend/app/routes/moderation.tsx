import { redirect } from "react-router";
import { ModerationQueue } from "~/components/admin/moderation-queue";
import { GuideFrame } from "~/components/guides/frame";
import { requireAdmin } from "~/lib/admin.server";
import { moderate, moderationData } from "~/lib/moderation.server";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/moderation";

export const meta = () => noindexSeo({ title: "Модерація, Fantasm", description: "Черга і історія рішень.", path: "/moderation" });

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request, true);
  if (user.role === "ADMIN") throw redirect("/admin/moderation");
  return moderationData(request);
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request, true);
  return moderate(request);
}

export default function Moderation({ loaderData }: Route.ComponentProps) {
  return (
    <GuideFrame>
      <ModerationQueue loaderData={loaderData} />
    </GuideFrame>
  );
}
