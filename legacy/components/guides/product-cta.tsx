import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/link";
import { Button } from "@/components/ui/button";
import { Spark } from "@/components/ui/spark";
import type { Cta } from "@/lib/content";

/** Turns a guide reader into a product action — the "learn → do" bridge. */
export function ProductCta({ cta }: { cta?: Cta }) {
  if (!cta) return null;
  return (
    <section className="card-2 relative overflow-hidden p-7 text-center sm:p-9">
      <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[radial-gradient(circle,color-mix(in_oklab,var(--accent)_30%,transparent),transparent_70%)]" />
      <div className="relative flex flex-col items-center">
        <span className="grid size-11 place-items-center rounded-xl bg-[var(--ink)] text-[color:var(--bg)]">
          <Spark accent className="size-5" />
        </span>
        <h2 className="text-h2 mt-4 max-w-xl">{cta.label}</h2>
        {cta.note && <p className="measure-narrow mt-2 text-[color:var(--ink-2)]">{cta.note}</p>}
        <Button asChild size="lg" className="mt-6">
          <Link href={cta.href}>
            Почати <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}
