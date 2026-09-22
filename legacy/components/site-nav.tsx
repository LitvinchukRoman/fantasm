"use client";

import { Link } from "@/lib/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { Bell, Plus, LogOut, User as UserIcon, Home, Lightbulb, CalendarDays, BookOpen } from "lucide-react";
import { useMe } from "@/lib/use-me";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Spark } from "@/components/ui/spark";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Головна", icon: Home },
  { href: "/ideas", label: "Ідеї", icon: Lightbulb },
  { href: "/events", label: "Події", icon: CalendarDays },
  { href: "/guides", label: "Гайди", icon: BookOpen },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function SiteNav() {
  const { data: me } = useMe();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <>
      {/* Top bar — chrome glass floating over content */}
      <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6">
        <nav className="chrome mx-auto flex max-w-6xl items-center gap-1 rounded-full px-3 py-2 sm:px-4">
          <Link href="/" className="flex items-center gap-2 pr-2" aria-label="NaUKMA Ideas — головна">
            <span className="grid size-8 place-items-center rounded-xl bg-[var(--ink)] text-[color:var(--bg)]">
              <Spark accent className="size-4" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">Ideas</span>
          </Link>

          <div className="ml-1 hidden items-center gap-0.5 sm:flex">
            {NAV.slice(1).map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative isolate rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-[var(--dur-1)]",
                    active ? "text-[color:var(--ink)]" : "text-[color:var(--ink-2)] hover:text-[color:var(--ink)]",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-active"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      className="absolute inset-0 -z-10 rounded-full bg-[color-mix(in_oklab,var(--ink)_8%,transparent)]"
                    />
                  )}
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <Button asChild size="sm" className="hidden sm:inline-flex">
              <Link href="/ideas/new">
                <Plus /> Ідея
              </Link>
            </Button>
            <ThemeToggle />

            {me ? (
              <>
                <Link
                  href="/me"
                  aria-label="Сповіщення"
                  className="relative grid size-9 place-items-center rounded-full text-[color:var(--ink-2)] transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] hover:text-[color:var(--ink)]"
                >
                  <Bell className="size-4" />
                  {me.unreadNotifications > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold tabnums text-white">
                      {me.unreadNotifications > 9 ? "9+" : me.unreadNotifications}
                    </span>
                  )}
                </Link>
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen((v) => !v)}
                    aria-label="Меню профілю"
                    className="rounded-full transition-transform active:scale-95"
                  >
                    <Avatar name={me.name} src={me.avatarUrl} size="sm" />
                  </button>
                  {menuOpen && (
                    <div
                      className="chrome absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl p-1.5 text-sm"
                      onMouseLeave={() => setMenuOpen(false)}
                    >
                      <div className="px-3 py-2">
                        <div className="flex items-center gap-1.5 truncate font-medium">{me.name}</div>
                        <div className="truncate text-xs text-[color:var(--ink-3)]">@{me.handle}</div>
                      </div>
                      <MenuLink href={`/u/${me.handle}`} icon={<UserIcon className="size-4" />}>Мій профіль</MenuLink>
                      <MenuLink href="/me" icon={<Bell className="size-4" />}>Кабінет</MenuLink>
                      {(me.role === "ADMIN" || me.role === "MODERATOR") && (
                        <MenuLink href="/admin" icon={<Lightbulb className="size-4" />}>Модерація</MenuLink>
                      )}
                      <button
                        onClick={logout}
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[color:var(--danger)] transition-colors hover:bg-[color-mix(in_oklab,var(--danger)_10%,transparent)]"
                      >
                        <LogOut className="size-4" /> Вийти
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Button asChild size="sm" variant="secondary">
                <Link href="/login">Увійти</Link>
              </Button>
            )}
          </div>
        </nav>
      </header>

      {/* Mobile bottom tab bar */}
      <nav className="chrome fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-full px-1.5 py-1.5 sm:hidden">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] transition-colors",
                active ? "text-[color:var(--accent-ink)]" : "text-[color:var(--ink-3)]",
              )}
            >
              <Icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
        <Link
          href="/ideas/new"
          className="flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] text-[color:var(--accent-ink)]"
        >
          <Plus className="size-5" />
          Ідея
        </Link>
      </nav>
    </>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)]"
    >
      {icon} {children}
    </Link>
  );
}
