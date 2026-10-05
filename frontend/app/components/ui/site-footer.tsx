import { Link } from "react-router";

/**
 * Єдиний футер сайту: бренд-блок і кластер «Продукт». Лендінг, стрічка, ідея, профіль, події, гайди.
 * Сторінки входу його не показують: там форма по центру й нічого більше.
 * Кластери «Стартапи» та «Ігри й кампус» з legacy сюди не переносимо (FULL_CONTEXT.md, «Висновок по архітектурі»).
 */
const PRODUCT_LINKS = [
  { href: "/ideas", label: "Ідеї" },
  { href: "/events", label: "Події" },
  { href: "/guides", label: "Гайди" },
  { href: "/ideas/new", label: "Запропонувати ідею" },
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-[var(--color-border)] bg-[var(--color-sheet)] px-5 py-12 sm:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="flex items-center gap-2">
            <img src="/favicon.jpg" alt="" width={32} height={32} className="size-8 rounded-lg" />
            <span className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">Fantasm</span>
          </div>
          <p className="mt-3 max-w-xs text-sm text-[var(--color-text-muted)]">
            Платформа ідей спільноти Києво-Могилянської академії. Від іскри до команди.
          </p>
        </div>

        <nav aria-label="Продукт" className="space-y-2.5">
          <div className="hud-label">Продукт</div>
          <ul className="space-y-2 text-sm text-[var(--color-text-muted)]">
            {PRODUCT_LINKS.map((link) => (
              <li key={link.href}>
                <Link to={link.href} prefetch="intent" className="transition-colors hover:text-[var(--color-text)]">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mx-auto mt-8 flex max-w-6xl flex-col items-center justify-between gap-2 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-faint)] sm:flex-row">
        <span>© 2026 Fantasm</span>
        <a href="https://www.ukma.edu.ua" className="transition-colors hover:text-[var(--color-text-muted)]">
          НаУКМА
        </a>
      </div>
    </footer>
  );
}
