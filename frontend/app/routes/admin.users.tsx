import { data, Form, Link } from "react-router";
import { Button } from "~/components/ui/button";
import { PageHeading, Select } from "~/components/admin/widgets";
import { requireAdmin } from "~/lib/admin.server";
import { ApiError, getAdminUsers, routeApi, setUserRole } from "~/lib/api.server";
import type { UserRole } from "~/lib/api-types";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/admin.users";

export const meta = () => noindexSeo({ title: "Користувачі, Fantasm", description: "Ролі учасників.", path: "/admin/users" });

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const list = await routeApi(getAdminUsers(request, url.searchParams.get("q") ?? undefined, url.searchParams.get("role") ?? undefined, url.searchParams.get("cursor") ?? undefined));
  return { ...list, q: url.searchParams.get("q") ?? "", role: url.searchParams.get("role") ?? "" };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdmin(request);
  const form = await request.formData();
  try {
    await setUserRole(request, String(form.get("handle")), String(form.get("role")) as UserRole);
    return data({ ok: true });
  } catch (error) {
    if (error instanceof ApiError) return data(error.body, { status: error.status });
    throw error;
  }
}

const ROLES: Array<{ value: UserRole; label: string }> = [
  { value: "USER", label: "Учасник" },
  { value: "MODERATOR", label: "Модератор" },
  { value: "ADMIN", label: "Адмін" },
];

const FILTERS = [{ value: "", label: "Усі" }, ...ROLES];

export default function Users({ loaderData }: Route.ComponentProps) {
  const q = loaderData.q;
  const role = loaderData.role;
  const next = new URLSearchParams();
  if (q) next.set("q", q);
  if (role) next.set("role", role);
  if (loaderData.nextCursor) next.set("cursor", loaderData.nextCursor);
  return (
    <div>
      <PageHeading title="Користувачі" lede="Роль змінює доступ одразу. Сесії людини, якій ви її змінили, завершуються." />
      <Form method="get" className="mt-8 flex flex-col gap-2 sm:flex-row">
        <input name="q" defaultValue={q} placeholder="Нік, імʼя або пошта" className="min-w-0 flex-1 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-4 py-2.5 text-sm outline-none placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent)]" />
        <Select name="role" defaultValue={role} aria-label="Роль" className="sm:w-44">
          {FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </Select>
        <Button type="submit" variant="secondary">Шукати</Button>
      </Form>
      <ul className="mt-6">
        {loaderData.users.length === 0 && <li className="border-t border-[var(--color-border)] py-8 text-sm text-[var(--color-text-muted)]">Нікого не знайдено.</li>}
        {loaderData.users.map((user) => (
          <li key={user.handle} className="border-t border-[var(--color-border)] py-5 last:border-b">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link to={`/u/${user.handle}`} className="text-lg font-medium tracking-tight hover:text-[var(--color-accent)]">{user.name}</Link>
                  <span className="rounded-full border border-[var(--color-border)] px-2.5 py-0.5 text-xs text-[var(--color-text-muted)]">{ROLES.find((item) => item.value === user.role)?.label}</span>
                  {user.protected && <span className="text-xs text-[var(--color-text-faint)]">захищений</span>}
                </div>
                <p className="mt-1 truncate text-sm text-[var(--color-text-muted)]">@{user.handle} · {user.email}</p>
                <p className="mt-1 text-sm text-[var(--color-text-faint)]">
                  карма {user.karma}{user.badge ? ` · ${user.badge}` : ""}{user.lastSeenAt ? ` · був ${user.lastSeenAt.slice(0, 10)}` : ""}
                </p>
              </div>
              {user.protected ? (
                <p className="text-sm text-[var(--color-text-faint)]">Роль зафіксована списком перших адмінів.</p>
              ) : (
                <Form method="post" className="flex shrink-0 items-center gap-2"
                  onSubmit={(event) => {
                    if (!confirm("Сесії цієї людини завершаться. Змінити роль?")) event.preventDefault();
                  }}>
                  <input type="hidden" name="handle" value={user.handle} />
                  <Select name="role" defaultValue={user.role} aria-label={`Роль ${user.name}`} className="w-40">
                    {ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </Select>
                  <Button type="submit" size="sm" variant="secondary">Зберегти</Button>
                </Form>
              )}
            </div>
          </li>
        ))}
      </ul>
      {loaderData.nextCursor && (
        <Button to={`?${next.toString()}`} variant="secondary" className="mt-6">Далі</Button>
      )}
    </div>
  );
}
