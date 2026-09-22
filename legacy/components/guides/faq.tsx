import { ChevronDown } from "lucide-react";
import type { Faq } from "@/lib/content";
import { JsonLd } from "@/components/json-ld";

/** FAQ accordion (native <details>) + FAQPage JSON-LD for rich results. */
export function FaqSection({ items }: { items: Faq[] }) {
  if (!items?.length) return null;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <section className="space-y-3">
      <JsonLd data={jsonLd} />
      <h2 className="text-h2">Часті запитання</h2>
      <div className="divide-y divide-[var(--line)] overflow-hidden rounded-2xl border border-[var(--line)]">
        {items.map((f, i) => (
          <details key={i} className="group bg-[var(--surface-1)] open:bg-[var(--surface-2)]">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium [&::-webkit-details-marker]:hidden">
              {f.q}
              <ChevronDown className="size-4 shrink-0 text-[color:var(--ink-3)] transition-transform duration-[var(--dur-2)] group-open:rotate-180" />
            </summary>
            <div className="px-5 pb-5 text-[color:var(--ink-2)]">{f.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}
