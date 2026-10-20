import { data, Form, redirect, useNavigation } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { Button } from "~/components/ui/button";
import { AvatarPicker } from "~/components/profile/avatar-picker";
import { IconCheck, IconGitHub } from "~/components/landing/icons";
import { ApiError, deleteAvatar, getCurrentUser, routeApi, unlinkGitHub, updateProfile, uploadAvatar } from "~/lib/api.server";
import {
  GITHUB_OUTCOMES,
  profileChanges,
  profileFieldErrors,
  TYPED_LINKS,
  type ProfileField,
  type TypedLinkKey,
} from "~/lib/profile";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/settings";

export const meta = () =>
  noindexSeo({ title: "Профіль, Fantasm", description: "Редагування профілю у Fantasm.", path: "/settings" });

export async function loader({ request }: Route.LoaderArgs) {
  const user = await routeApi(getCurrentUser(request));
  if (!user) throw redirect("/login");
  const github = GITHUB_OUTCOMES[new URL(request.url).searchParams.get("github") ?? ""];
  return { user, github };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const current = await routeApi(getCurrentUser(request));
  if (!current) throw redirect("/login");
  const intent = form.get("intent");
  if (intent === "github-unlink") {
    await unlinkGitHub(request);
    return redirect("/settings");
  }
  if (intent === "avatar" || intent === "avatar-delete") {
    const image = form.get("avatar");
    if (intent === "avatar" && !(image instanceof Blob && image.size > 0)) {
      return data({ avatar: { error: "Оберіть фото." } }, { status: 400 });
    }
    try {
      await (intent === "avatar" ? uploadAvatar(request, image as Blob) : deleteAvatar(request));
      return data({ avatar: { error: undefined } });
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      const message =
        error.status === 413 ? "Фото завелике навіть після стиснення. Спробуйте інше."
        : error.status === 422 ? "Підійде фото у форматі JPEG, PNG або WebP."
        : "Не вдалося зберегти фото. Спробуйте ще раз.";
      return data({ avatar: { error: message } }, { status: error.status });
    }
  }
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

const LINK_PLACEHOLDERS: Record<TypedLinkKey, string> = {
  linkedin: "linkedin.com/in/імʼя",
  instagram: "@нікнейм",
};

const INPUT =
  "block w-full rounded-[var(--radius-control)] border bg-[var(--color-bg)] px-3 py-2 text-[16px] text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-all duration-500 hover:border-[var(--color-accent)] input-focus-pulse focus:outline-none sm:text-sm";

export default function Settings({ loaderData, actionData }: Route.ComponentProps) {
  const { user, github } = loaderData;
  const saving = useNavigation().state === "submitting";
  // Відповіді про фото забирає fetcher в AvatarPicker; тут лише результат форми профілю.
  const profileResult = actionData && "fields" in actionData ? actionData : undefined;
  const fields: Record<string, string> = profileResult?.fields ?? {};
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

        <div className="mt-8">
          <AvatarPicker name={user.name} src={user.avatarUrl || undefined} />
        </div>

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
            <textarea rows={4} maxLength={500} {...field("bio", "mt-1.5 resize-y !rounded-xl")} />
            {error("bio")}
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-[var(--color-text)]">Посилання</legend>
            <div>
              <span className="block text-xs text-[var(--color-text-muted)]">GitHub</span>
              {user.github ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <a
                    href={`https://github.com/${encodeURIComponent(user.github)}`}
                    target="_blank"
                    rel="me noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-[var(--color-text)] hover:text-[var(--color-accent)]"
                  >
                    <IconGitHub className="size-4" />
                    {user.github}
                  </a>
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)]">
                    <IconCheck className="size-3.5 text-[var(--color-accent)]" />
                    Підтверджено GitHub
                  </span>
                  <button
                    type="submit"
                    form="github-unlink"
                    className="text-xs text-[var(--color-text-faint)] underline-offset-4 hover:text-[var(--color-text)] hover:underline"
                  >
                    Відключити
                  </button>
                </div>
              ) : (
                <>
                  {/* Повна навігація без prefetch: запит сам починає підключення й веде на github.com. */}
                  <Button to="/api/me/github/connect" reloadDocument prefetch="none" variant="secondary" className="mt-1.5">
                    <IconGitHub className="size-4" />
                    Підключити GitHub
                  </Button>
                  <p className="mt-1.5 text-xs text-[var(--color-text-faint)]">
                    GitHub сам підтвердить, що акаунт ваш. Доступу до репозиторіїв Fantasm не отримує.
                  </p>
                </>
              )}
              {github && (
                <p role="status" className={`mt-1.5 text-sm ${github.ok ? "text-[var(--color-text-muted)]" : "text-red-400"}`}>
                  {github.text}
                </p>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-faint)]">LinkedIn та Instagram: вставте посилання на профіль або нікнейм. Порожнє поле прибирає посилання.</p>
            {TYPED_LINKS.map((link) => (
              <div key={link.key}>
                <label htmlFor={link.key} className="block text-xs text-[var(--color-text-muted)]">{link.label}</label>
                <input
                  type="text"
                  inputMode="url"
                  maxLength={200}
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={LINK_PLACEHOLDERS[link.key]}
                  {...field(link.key)}
                />
                {error(link.key)}
              </div>
            ))}
          </fieldset>

          {profileResult?.error && !Object.keys(fields).length && (
            <p role="alert" className="text-sm text-red-400">{profileResult.error}</p>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={saving}>{saving ? "Зберігаю…" : "Зберегти"}</Button>
            <Button to={`/u/${user.handle}`} variant="secondary">Скасувати</Button>
          </div>
        </Form>
        {/* Окрема форма, щоб «Відключити» не надсилало незбережені поля профілю. */}
        <Form method="post" id="github-unlink" hidden>
          <input type="hidden" name="intent" value="github-unlink" />
        </Form>
      </div>
    </GuideFrame>
  );
}
