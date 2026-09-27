import { useEffect, useState } from "react";

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
          ? "border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-md"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <a href="/" className="flex items-center gap-2" aria-label="Fantasm, головна">
          <img src="/favicon.jpg" alt="" width={32} height={32} className="size-8 rounded-lg" />
          <span className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">
            Fantasm
          </span>
        </a>

        <nav className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-[var(--radius-control)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-text-muted)] transition-all duration-150 hover:text-[var(--color-text)] hover:scale-105"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="/ideas/new"
            className="hidden rounded-[var(--radius-control)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-bg)] transition-all duration-200 hover:bg-[var(--color-accent-strong)] hover:scale-105 sm:inline-flex"
          >
            Ідея
          </a>
          <a
            href="/login"
            className="rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition-all duration-200 hover:bg-[var(--color-surface-strong)] hover:scale-105"
          >
            Увійти
          </a>
        </div>
      </div>
    </header>
  );
}
