import { data, Form, redirect, useNavigation } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { Button } from "~/components/ui/button";
import { ApiError, getCurrentUser, routeApi, updateProfile } from "~/lib/api.server";
import { profileChanges, profileFieldErrors, type ProfileField } from "~/lib/profile";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/settings";

export const meta = () =>
  noindexSeo({ title: "Профіль, Fantasm", description: "Редагування профілю у Fantasm.", path: "/settings" });

export async function loader({ request }: Route.LoaderArgs) {
  const user = await routeApi(getCurrentUser(request));
  if (!user) throw redirect("/login");
  return { user };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const current = await routeApi(getCurrentUser(request));
  if (!current) throw redirect("/login");
  const update = profileChanges(form, current);
  if (Object.keys(update).length === 0) return redirect(`/u/${current.handle}`);
  try {
    const user = await updateProfile(request, update);
    return redirect(`/u/${user.handle}`);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const fields = profileFieldErrors(error.body.fields);
    return data(
      { error: Object.keys(fields).length ? "Перевірте поля." : error.body.error, fields },
      { status: error.status },
    );
  }
}

const INPUT =
  "block w-full rounded-[var(--radius-control)] border bg-[var(--color-bg)] px-3 py-2 text-[16px] text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-all duration-500 hover:border-[var(--color-accent)] input-focus-pulse focus:outline-none sm:text-sm";

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { user } = loaderData;
  const saving = useNavigation().state === "submitting";
  const fields: Record<string, string> = actionData?.fields ?? {};
  const field = (name: ProfileField, extra = "mt-1.5") => ({
    id: name,
    name,
    defaultValue: user[name] ?? "",
    "aria-invalid": fields[name] ? true : undefined,
    "aria-describedby": fields[name] ? `${name}-error` : undefined,
    className: `${INPUT} ${extra} ${fields[name] ? "border-red-500" : "border-[var(--color-border)]"}`,
  });
  const error = (name: string) =>
    fields[name] && (
      <p id={`${name}-error`} className="mt-1.5 text-sm text-red-400">
        {fields[name]}
      </p>
    );

  return (
    <GuideFrame>
      <div className="mx-auto max-w-xl">
        <h1 className="text-3xl font-semibold">Профіль</h1>
        <p className="mt-2 text-[var(--color-text-muted)]">Імʼя та нікнейм бачать усі, хто відкриває ваші ідеї.</p>

        <Form method="post" className="mt-8 space-y-5">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text)]">Імʼя</label>
            <input type="text" required maxLength={100} autoComplete="name" {...field("name")} />
            {error("name")}
          </div>

          <div>
            <label htmlFor="handle" className="block text-sm font-medium text-[var(--color-text)]">Нікнейм</label>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-[var(--color-text-faint)]">@</span>
              <input
                type="text"
                required
                minLength={3}
                maxLength={30}
                pattern="[a-z0-9][a-z0-9_\-]{2,29}"
                autoCapitalize="none"
                autoComplete="username"
                spellCheck={false}
                {...field("handle", "pl-7")}
              />
            </div>
            {error("handle") || (
              <p className="mt-1.5 text-xs text-[var(--color-text-faint)]">Адреса профілю: /u/нікнейм. Малі латинські літери, цифри, «_» або «-».</p>
            )}
          </div>

          <div>
            <label htmlFor="faculty" className="block text-sm font-medium text-[var(--color-text)]">Факультет</label>
            <input type="text" maxLength={100} placeholder="Наприклад: ФІ" {...field("faculty")} />
            {error("faculty")}
          </div>

          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-[var(--color-text)]">Про себе</label>
            <textarea rows={4} maxLength={500} {...field("bio", "mt-1.5 resize-y")} />
            {error("bio")}
          </div>

          {actionData?.error && !Object.keys(fields).length && (
            <p role="alert" className="text-sm text-red-400">{actionData.error}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saving}>{saving ? "Зберігаю…" : "Зберегти"}</Button>
            <Button to={`/u/${user.handle}`} variant="secondary">Скасувати</Button>
          </div>
        </Form>
      </div>
    </GuideFrame>
  );
}
