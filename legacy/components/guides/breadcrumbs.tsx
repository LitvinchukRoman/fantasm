import { ChevronRight } from "lucide-react";
import { Link } from "@/lib/link";
import { JsonLd } from "@/components/json-ld";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ideas.naukma.com";

export interface Crumb {
  label: string;
  href: string;
}

/** Breadcrumb trail + BreadcrumbList JSON-LD. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      item: `${siteUrl}${c.href}`,
    })),
  };

  return (
    <nav aria-label="Хлібні крихти" className="flex flex-wrap items-center gap-1.5 text-sm text-[color:var(--ink-2)]">
      <JsonLd data={jsonLd} />
      {items.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3.5 text-[color:var(--ink-3)]" />}
          {i === items.length - 1 ? (
            <span className="text-[color:var(--ink)]">{c.label}</span>
          ) : (
            <Link href={c.href} className="transition-colors hover:text-[color:var(--ink)]">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
