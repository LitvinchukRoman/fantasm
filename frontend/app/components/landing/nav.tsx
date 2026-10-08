import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useFetcher, useLocation, useRouteLoaderData } from "react-router";
import { Button } from "~/components/ui/button";
import type { RootData } from "~/root";
import { IconArrowRight } from "./icons";

const NAV_LINKS = [
  { href: "/ideas", label: "Ідеї" },
  { href: "/events", label: "Події" },
  { href: "/guides", label: "Гайди" },
];

/**
 * Навігація лежить поверх повноекранної сфери (fixed, прозора на герої).
 * Після скролу до сірої сторінки з'являється підкладка, щоб пункти не
 * зливались із контентом. Посилання: Ідеї, Події, Гайди.
 *
 * На телефонах (< sm) пункти не вміщаються в шапку, тому вони живуть у меню-шторці
 * за кнопкою-бургером: великі цілі натискання, кнопка «Ідея» теж тут.
 */
export function Nav({ forceSolid = false }: { forceSolid?: boolean }) {
  const root = useRouteLoaderData<RootData>("root");
  const logout = useFetcher();
  const [solid, setSolid] = useState(forceSolid);
  // Шторка відкрита для конкретної сторінки: перехід кудись інде закриває її без ефектів.
  const { pathname } = useLocation();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const menuOpen = openFor === pathname;
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenFor(null);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setOpenFor(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      ref={headerRef}
      className={`fixed inset-x-0 top-0 z-30 transition-colors duration-200 ${
        solid || forceSolid || menuOpen
          ? "border-b border-[var(--color-border)] bg-[var(--color-bg)]/60 backdrop-blur-2xl saturate-150 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link to="/" prefetch="intent" className="flex items-center gap-2" aria-label="Fantasm, головна">
          <img src="/favicon.jpg" alt="" width={32} height={32} className="size-8 rounded-lg" />
          <span className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">
            Fantasm
          </span>
        </Link>

        <nav aria-label="Основна навігація" className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.href}
              to={link.href}
              prefetch="intent"
              className={({ isActive }) =>
                "rounded-[var(--radius-control)] px-3.5 py-1.5 text-sm font-medium transition-all duration-150 hover:text-[var(--color-text)] hover:scale-105 " +
                (isActive ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]")
              }
            >
              {link.label}
            </NavLink>
          ))}
          {(root?.currentUser?.role === "MODERATOR" || root?.currentUser?.role === "ADMIN") && (
            <NavLink to="/moderation" className="rounded-[var(--radius-control)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
              Модерація
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/ideas/new"
            prefetch="intent"
            className="hidden rounded-[var(--radius-control)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition-all duration-200 hover:bg-[var(--color-accent-strong)] hover:scale-105 sm:inline-flex"
          >
            Ідея
          </Link>
          {root?.currentUser ? (
            <>
              <Link
                to="/notifications"
                className="rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3 py-2 text-sm text-[var(--color-text)]"
                aria-label={`Сповіщення, непрочитаних: ${root.unread}`}
              >
                Сповіщення{root.unread > 0 ? ` · ${root.unread}` : ""}
              </Link>
              <Link
                to={`/u/${root.currentUser.handle}`}
                className="hidden max-w-40 truncate text-sm text-[var(--color-text)] md:inline"
                title={`@${root.currentUser.handle}`}
              >
                {root.currentUser.name}
              </Link>
              <logout.Form method="post" action="/logout">
                <button className="rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3.5 py-2 text-sm text-[var(--color-text)]">
                  Вийти
                </button>
              </logout.Form>
            </>
          ) : (
            <Link
              to="/login"
              prefetch="intent"
              className="rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-3.5 py-2 text-sm font-medium text-[var(--color-text)] transition-all duration-200 hover:bg-[var(--color-surface-strong)] hover:scale-105 sm:px-4"
            >
              Увійти
            </Link>
          )}
          <button
            type="button"
            aria-label={menuOpen ? "Закрити меню" : "Відкрити меню"}
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setOpenFor(menuOpen ? null : pathname)}
            className="relative grid size-10 place-items-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] text-[var(--color-text)] sm:hidden"
          >
            <span aria-hidden="true" className="relative block h-3 w-4">
              <span
                className={`absolute inset-x-0 h-px bg-current transition-all duration-300 ease-[var(--ease-out-expo)] ${
                  menuOpen ? "top-1/2 rotate-45" : "top-0"
                }`}
              />
              <span
                className={`absolute inset-x-0 top-1/2 h-px bg-current transition-opacity duration-200 ${
                  menuOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <span
                className={`absolute inset-x-0 h-px bg-current transition-all duration-300 ease-[var(--ease-out-expo)] ${
                  menuOpen ? "top-1/2 -rotate-45" : "bottom-0"
                }`}
              />
            </span>
          </button>
        </div>
      </div>

      <div
        id="mobile-menu"
        inert={!menuOpen}
        className={`sm:hidden overflow-hidden transition-[max-height,opacity] duration-300 ease-[var(--ease-out-expo)] ${
          menuOpen ? "max-h-[28rem] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <nav aria-label="Мобільна навігація" className="mx-auto max-w-6xl px-5 pt-2 pb-5">
          <ul className="divide-y divide-[var(--color-border)]">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <NavLink
                  to={link.href}
                  prefetch="intent"
                  className={({ isActive }) =>
                    "flex items-center justify-between py-4 text-xl font-medium tracking-tight " +
                    (isActive ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]")
                  }
                >
                  {({ isActive }) => (
                    <>
                      {link.label}
                      {isActive ? (
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-[var(--color-accent)]" />
                      ) : (
                        <IconArrowRight className="size-4 text-[var(--color-text-faint)]" />
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
          <Button to="/ideas/new" arrow className="mt-4 w-full py-3.5">
            Запропонувати ідею
          </Button>
        </nav>
      </div>
    </header>
  );
}
