import { NavLink, Outlet } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { requireAdmin } from "~/lib/admin.server";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/admin";

export const meta = () => noindexSeo({ title: "Адмінка, Fantasm", description: "Стан платформи Fantasm.", path: "/admin" });

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  return null;
}

const LINKS = [
  { to: "/admin", label: "Огляд", end: true },
  { to: "/admin/analytics", label: "Аналітика" },
  { to: "/admin/moderation", label: "Модерація" },
  { to: "/admin/users", label: "Користувачі" },
  { to: "/admin/settings", label: "Налаштування" },
];

export default function AdminLayout() {
  return (
    <GuideFrame>
      <div className="grid gap-8 lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Розділи адмінки" className="flex flex-wrap gap-2 lg:sticky lg:top-24 lg:flex-col lg:flex-nowrap lg:self-start">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end}
              className={({ isActive }) =>
                "shrink-0 rounded-full px-3.5 py-2 text-sm transition-colors " +
                (isActive
                  ? "bg-[var(--color-surface-strong)] text-[var(--color-text)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]")
              }>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </GuideFrame>
  );
}
