import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";
import { IconArrowRight } from "~/components/landing/icons";
import { AvatarPicker } from "~/components/profile/avatar-picker";
import { ApiError, getCurrentUser, routeApi, updateProfile } from "~/lib/api.server";
import { isGeneratedHandle, PROFILE_FIELDS, profileFieldErrors, type ProfileField, type ProfileUpdate } from "~/lib/profile";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/welcome";

export const meta = () =>
  noindexSeo({ title: "Розкажіть про себе, Fantasm", description: "Перший крок у Fantasm: імʼя та нікнейм.", path: "/welcome" });

/** `next` приходить з адреси: пускаємо лише шляхи цього сайту, без `//host` і `/\host`. */
function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\") || value.startsWith("/welcome")) {
    return "/ideas";
  }
  return value;
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await routeApi(getCurrentUser(request));
  if (!user) throw redirect("/login");
  const next = safeNext(new URL(request.url).searchParams.get("next"));
  if (user.onboarded !== false) throw redirect(next);
  return {
    name: user.name,
    handle: isGeneratedHandle(user.handle) ? (user.suggestedHandle ?? "") : user.handle,
    faculty: user.faculty ?? "",
    bio: user.bio ?? "",
    avatarUrl: user.avatarUrl || undefined,
    next,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const update: ProfileUpdate = {};
  for (const field of PROFILE_FIELDS) update[field] = String(form.get(field) ?? "").trim();
  try {
    await updateProfile(request, update);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    const fields = profileFieldErrors(error.body.fields);
    return data({ error: Object.keys(fields).length ? "Перевірте поля." : error.body.error, fields }, { status: error.status });
  }
  return redirect(safeNext(new URL(request.url).searchParams.get("next")));
}

const INPUT =
  "mt-1.5 block w-full rounded-[var(--radius-control)] border bg-[var(--color-bg)] px-3 py-2 text-[16px] text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-accent)] input-focus-pulse focus:outline-none sm:text-sm";

export default function Welcome({ loaderData, actionData }: Route.ComponentProps) {
  const saving = useNavigation().state === "submitting";
  const [handle, setHandle] = useState(loaderData.handle);
  const fields: Record<string, string> = actionData?.fields ?? {};
  const field = (name: ProfileField) => ({
    id: name,
    name,
    "aria-invalid": fields[name] ? true : undefined,
    "aria-describedby": fields[name] ? `${name}-error` : `${name}-hint`,
    className: `${INPUT} ${fields[name] ? "border-red-500" : "border-[var(--color-border)]"}`,
  });
  const hint = (name: ProfileField, text: React.ReactNode) =>
    fields[name] ? (
      <p id={`${name}-error`} className="mt-1.5 text-sm text-red-400">{fields[name]}</p>
    ) : (
      <p id={`${name}-hint`} className="mt-1.5 text-xs text-[var(--color-text-faint)]">{text}</p>
    );

  return (
    <div>
      <h1 className="text-center text-xl font-semibold text-[var(--color-text)]">Розкажіть про себе</h1>
      <p className="mt-2 text-center text-sm text-[var(--color-text-muted)]">
        Так вас бачитимуть автори ідей і команди. Усе це можна змінити пізніше в профілі.
      </p>

      <div className="mt-8">
        <AvatarPicker name={loaderData.name} src={loaderData.avatarUrl} />
      </div>

      <Form method="post" className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-[var(--color-text)]">Імʼя</label>
          <input type="text" required maxLength={100} autoComplete="name" defaultValue={loaderData.name} {...field("name")} />
          {hint("name", "Підтягнули з вашого акаунта. Виправте, якщо треба.")}
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
              placeholder="ivan-franko"
              value={handle}
              onChange={(event) => setHandle(event.target.value.toLowerCase())}
              {...field("handle")}
              className={`${field("handle").className} !mt-0 pl-7`}
            />
          </div>
          {hint(
            "handle",
            <>
              Адреса профілю: <span className="text-[var(--color-text-muted)]">/u/{handle || "нікнейм"}</span>. Латиниця, цифри, «_» або «-».
            </>,
          )}
        </div>

        <div>
          <label htmlFor="faculty" className="block text-sm font-medium text-[var(--color-text)]">
            Факультет <span className="font-normal text-[var(--color-text-faint)]">· необовʼязково</span>
          </label>
          <input type="text" maxLength={100} placeholder="Наприклад: ФІ" defaultValue={loaderData.faculty} {...field("faculty")} />
          {fields.faculty && hint("faculty", null)}
        </div>

        <div>
          <label htmlFor="bio" className="block text-sm font-medium text-[var(--color-text)]">
            Про себе <span className="font-normal text-[var(--color-text-faint)]">· необовʼязково</span>
          </label>
          <textarea
            rows={3}
            maxLength={500}
            placeholder="Що вмієте, що шукаєте, чим горите"
            defaultValue={loaderData.bio}
            {...field("bio")}
            className={`${field("bio").className} resize-y`}
          />
          {fields.bio && hint("bio", null)}
        </div>

        {actionData?.error && !Object.keys(fields).length && (
          <p role="alert" className="text-sm text-red-400">{actionData.error}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="btn-shimmer mt-2 flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent-strong)] disabled:opacity-60"
        >
          {saving ? "Зберігаю…" : "Продовжити"}
          <IconArrowRight className="size-4" />
        </button>
      </Form>

      <Form method="post" action="/logout" className="mt-6 text-center text-sm text-[var(--color-text-muted)]">
        Не ваш акаунт?{" "}
        <button type="submit" className="font-medium text-[var(--color-text)] transition-colors hover:text-[var(--color-accent)]">
          Вийти
        </button>
      </Form>
    </div>
  );
}
