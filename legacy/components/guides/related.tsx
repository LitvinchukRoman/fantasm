import { ArrowRight } from "lucide-react";
import { Link } from "@/lib/link";

/** Internal-linking block: related articles in the same cluster. */
export function Related({ items }: { items: { title: string; description: string; path: string }[] }) {
  if (!items.length) return null;
  return (
    <section className="space-y-4">
      <h2 className="text-h2">Читати далі</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((r) => (
          <Link
            key={r.path}
            href={r.path}
            className="group rounded-2xl border border-[var(--line)] bg-[var(--surface-1)] p-5 transition-colors duration-[var(--dur-2)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
          >
            <h3 className="font-semibold leading-snug transition-colors group-hover:text-[color:var(--accent-ink)]">
              {r.title}
            </h3>
            <p className="mt-1.5 line-clamp-2 text-sm text-[color:var(--ink-2)]">{r.description}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[color:var(--accent-ink)]">
              Читати <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
