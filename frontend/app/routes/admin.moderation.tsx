import { ModerationQueue } from "~/components/admin/moderation-queue";
import { requireAdmin } from "~/lib/admin.server";
import { moderate, moderationData } from "~/lib/moderation.server";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/admin.moderation";

export const meta = () => noindexSeo({ title: "Модерація, Fantasm", description: "Черга і історія рішень.", path: "/admin/moderation" });

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request, true);
  return moderationData(request);
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request, true);
  return moderate(request);
}

export default function Moderation({ loaderData }: Route.ComponentProps) {
  return <ModerationQueue loaderData={loaderData} />;
}
