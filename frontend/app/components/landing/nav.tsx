import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router";

const NAV_LINKS = [
  { href: "/ideas", label: "Ідеї" },
  { href: "/events", label: "Події" },
  { href: "/guides", label: "Гайди" },
];

/**
 * Навігація лежить поверх повноекранної сфери (fixed, прозора на герої).
 * Після скролу до сірої сторінки з'являється підкладка, щоб пункти не
 * зливались із контентом. Посилання: Ідеї, Події, Гайди.
 */
export function Nav({ forceSolid = false }: { forceSolid?: boolean }) {
  const [solid, setSolid] = useState(forceSolid);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-30 transition-colors duration-200 ${
        solid || forceSolid
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
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/ideas/new"
            prefetch="intent"
            className="hidden rounded-[var(--radius-control)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition-all duration-200 hover:bg-[var(--color-accent-strong)] hover:scale-105 sm:inline-flex"
          >
            Ідея
          </Link>
          <Link
            to="/login"
            prefetch="intent"
            className="rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-all duration-200 hover:bg-[var(--color-surface-strong)] hover:scale-105"
          >
            Увійти
          </Link>
        </div>
      </div>
    </header>
  );
}
