import { Link } from "@/lib/link";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Cover } from "@/components/ui/cover";
import { CampusMap } from "@/components/campus/campus-map";
import { BUILDINGS, CAMPUS_HIGHLIGHTS } from "@/lib/campus";

/**
 * Home "Campus" section — decorative mini-map + three highlight tiles + CTA.
 * Fills the "site looks empty" gap and funnels to the interactive map article.
 */
export function CampusTeaser() {
  const tiles = CAMPUS_HIGHLIGHTS.map((id) => BUILDINGS.find((b) => b.id === id)).filter(
    (b): b is (typeof BUILDINGS)[number] => Boolean(b),
  );

  return (
    <section className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-h2 flex items-center gap-2">
            <MapPin className="size-6 text-[color:var(--accent-ink)]" /> Кампус Могилянки
          </h2>
          <p className="measure text-[color:var(--ink-2)]">
            Компактне «містечко» корпусів у серці Подолу — від Староакадемічного до бібліотеки Антоновичів.
          </p>
        </div>
        <Button asChild variant="tertiary" className="hidden sm:inline-flex">
          <Link href="/campus/karta-kampusu">
            Відкрити карту <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Link
          href="/campus/karta-kampusu"
          aria-label="Інтерактивна карта кампусу НаУКМА"
          className="group rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] p-5 transition-colors duration-[var(--dur-1)] hover:border-[var(--line-strong)]"
        >
          <CampusMap interactive={false} className="mx-auto max-w-[280px]" />
        </Link>

        <div className="grid gap-4 sm:grid-cols-3">
          {tiles.map((b) => (
            <Link
              key={b.id}
              href="/campus/karta-kampusu"
              className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] transition-colors duration-[var(--dur-1)] hover:border-[var(--line-strong)]"
            >
              <Cover seed={b.id} className="grid aspect-[4/3] w-full place-items-center">
                <span className="text-3xl font-semibold text-white/90">{b.num}</span>
              </Cover>
              <div className="flex-1 p-4">
                <h3 className="text-sm font-semibold text-[color:var(--ink)]">{b.name}</h3>
                <p className="mt-1 text-xs text-[color:var(--ink-2)]">{b.short}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="sm:hidden">
        <Button asChild variant="secondary" className="w-full">
          <Link href="/campus/karta-kampusu">
            Відкрити карту кампусу <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
