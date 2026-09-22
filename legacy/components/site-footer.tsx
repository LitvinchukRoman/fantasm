import { Link } from "@/lib/link";
import { Spark } from "@/components/ui/spark";

const CLUSTERS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Продукт",
    links: [
      { href: "/ideas", label: "Ідеї" },
      { href: "/events", label: "Події" },
      { href: "/ideas/new", label: "Запропонувати ідею" },
      { href: "/guides", label: "Гайди" },
    ],
  },
  {
    title: "Стартапи",
    links: [
      { href: "/startups", label: "Запустити стартап" },
      { href: "/startups/yak-znaity-spivzasnovnyka", label: "Знайти співзасновника" },
      { href: "/startups/hranty-ta-konkursy-dlia-studentiv", label: "Гранти й конкурси" },
      { href: "/startups/pitch-deck-shablon", label: "Pitch deck" },
    ],
  },
  {
    title: "Ігри та кампус",
    links: [
      { href: "/games/mafia-pravyla", label: "Правила мафії" },
      { href: "/games", label: "Ігри для компанії" },
      { href: "/campus/karta-kampusu", label: "Карта кампусу" },
      { href: "/campus", label: "Життя в НаУКМА" },
      { href: "/campus/studentski-orhanizatsii-naukma", label: "Студентські організації" },
    ],
  },
];

/** Footer: brand + internal-linking clusters (SEO) + cross-links to sibling products. */
export function SiteFooter() {
  return (
    <footer className="mx-auto mt-24 max-w-6xl px-4 pb-28 pt-10 text-sm text-[color:var(--ink-2)] sm:pb-10">
      <div className="card grid gap-8 p-7 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-[var(--ink)] text-[color:var(--bg)]">
              <Spark accent className="size-4" />
            </span>
            <span className="font-display text-lg font-bold text-[color:var(--ink)]">NaUKMA Ideas</span>
          </div>
          <p className="measure-narrow mt-3">
            Платформа ідей спільноти Києво-Могилянської академії та друзів. Від іскри — до команди.
          </p>
        </div>
        {CLUSTERS.map((c) => (
          <nav key={c.title} className="space-y-2.5">
            <div className="text-caption">{c.title}</div>
            <ul className="space-y-2">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-[color:var(--ink)]">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mt-4 flex flex-col items-center justify-between gap-2 text-xs text-[color:var(--ink-3)] sm:flex-row">
        <span>© {new Date().getFullYear()} NaUKMA Ideas</span>
        <nav className="flex gap-4">
          <a href="https://app.naukma.com" className="transition-colors hover:text-[color:var(--ink)]">Random Coffee</a>
          <a href="https://www.ukma.edu.ua" className="transition-colors hover:text-[color:var(--ink)]">НаУКМА</a>
        </nav>
      </div>
    </footer>
  );
}
