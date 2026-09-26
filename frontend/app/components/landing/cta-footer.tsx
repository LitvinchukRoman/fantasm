import { IconArrowRight } from "./icons";

/**
 * Футер — brand-блок + кластер "Продукт" з
 * legacy/components/site-footer.tsx. Кластери "Стартапи" і "Ігри та
 * кампус" з legacy туди не переносимо: FULL_CONTEXT.md, розділ
 * "Висновок по архітектурі" (рядок ~188), явно відкладає SEO-гайди й
 * кампусну карту як редакційний шар, не ядро Fantasm — тож посилання на
 * /startups, /games, /campus сюди свідомо не додані.
 */
const PRODUCT_LINKS = [
  { href: "/ideas", label: "Ідеї" },
  { href: "/events", label: "Події" },
  { href: "/ideas/new", label: "Запропонувати ідею" },
];

export function CtaFooter() {
  return (
    <>
      <section className="relative z-10 flex min-h-[78vh] flex-col items-center justify-center px-5 py-24 text-center sm:px-8">
        <p className="mx-auto max-w-2xl text-2xl font-semibold text-white sm:text-3xl">
          Найкращі ідеї помирають не від браку таланту, а від браку людей
          поруч. Тут вони знаходять одне одного.
        </p>
        <div className="mt-8">
          <a
            href="/ideas/new"
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-bg)] transition-transform duration-150 hover:bg-[var(--color-accent-strong)] active:scale-[0.98]"
          >
            Поділитися ідеєю
            <IconArrowRight className="size-4" />
          </a>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[var(--color-border)] bg-[#121316] px-5 py-12 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-8 sm:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <img src="/favicon.jpg" alt="" width={32} height={32} className="size-8 rounded-lg" />
              <span className="text-[15px] font-semibold tracking-tight text-[var(--color-text)]">
                Fantasm
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-[var(--color-text-muted)]">
              Платформа ідей спільноти Києво-Могилянської академії. Від
              іскри до команди.
            </p>
          </div>

          <nav aria-label="Продукт" className="space-y-2.5">
            <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-faint)]">
              Продукт
            </div>
            <ul className="space-y-2 text-sm text-[var(--color-text-muted)]">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="transition-colors hover:text-[var(--color-text)]">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mx-auto mt-8 flex max-w-6xl flex-col items-center justify-between gap-2 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-faint)] sm:flex-row">
          <span>© 2026 Fantasm</span>
          <a
            href="https://www.ukma.edu.ua"
            className="transition-colors hover:text-[var(--color-text-muted)]"
          >
            НаУКМА
          </a>
        </div>
      </footer>
    </>
  );
}
