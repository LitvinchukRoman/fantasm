import { data, Form } from "react-router";
import { PageHeading } from "~/components/admin/widgets";
import { Button } from "~/components/ui/button";
import { requireAdmin } from "~/lib/admin.server";
import { ApiError, getAdminSettings, routeApi, setAdminSettings } from "~/lib/api.server";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/admin.settings";

export const meta = () => noindexSeo({ title: "Налаштування, Fantasm", description: "Перемикач премодерації.", path: "/admin/settings" });

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return routeApi(getAdminSettings(request));
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  const mode = String(form.get("premoderation"));
  if (mode !== "EXTERNAL_ONLY" && mode !== "ALL") return data({ error: "Невідомий режим" }, { status: 422 });
  try {
    return await setAdminSettings(request, mode);
  } catch (error) {
    if (error instanceof ApiError) return data({ error: error.body.error }, { status: error.status });
    throw error;
  }
}

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const mode = actionData && "premoderation" in actionData ? actionData.premoderation : loaderData.premoderation;
  return (
    <div>
      <PageHeading title="Налаштування" lede="Хто публікує ідею одразу, а хто чекає рішення. Денний ліміт зовнішніх авторів від цього не змінюється." />
      <Form method="post" key={mode} className="mt-8 max-w-xl space-y-3">
        <fieldset className="space-y-3">
          <legend className="text-base font-medium">Премодерація нових ідей</legend>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-sm has-[:checked]:border-[var(--color-accent)]">
            <input type="radio" name="premoderation" value="EXTERNAL_ONLY" defaultChecked={mode === "EXTERNAL_ONLY"} className="mt-1 accent-[var(--color-accent)]" />
            <span>Лише зовнішні автори. Люди з кампусу і ті, кого вже схвалювали тричі, публікують одразу.</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 text-sm has-[:checked]:border-[var(--color-accent)]">
            <input type="radio" name="premoderation" value="ALL" defaultChecked={mode === "ALL"} className="mt-1 accent-[var(--color-accent)]" />
            <span>Усі нові ідеї чекають рішення модератора. Чернетки не потрапляють у чергу.</span>
          </label>
        </fieldset>
        <Button type="submit">Зберегти</Button>
        {actionData && "error" in actionData && <p role="alert" className="text-sm text-red-300">{actionData.error}</p>}
      </Form>
    </div>
  );
}
