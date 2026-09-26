import type { Doc, Faq } from "~/lib/content";
import { HUBS } from "~/lib/content-meta";
import { GuideMarkdown } from "./markdown";
import { Toc } from "./toc";

function FaqList({ items }: { items: Faq[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-2xl font-semibold text-[var(--color-text)]">Часті запитання</h2>
      <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
        {items.map((item) => (
          <details key={item.q} className="group bg-[var(--color-surface)]">
            <summary className="cursor-pointer list-none px-5 py-4 font-medium text-[var(--color-text)] [&::-webkit-details-marker]:hidden">
              {item.q}
            </summary>
            <p className="px-5 pb-5 text-[var(--color-text-muted)]">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

export function ArticleView({
  doc,
  related,
}: {
  doc: Doc;
  related: { title: string; description: string; path: string }[];
}) {
  const fm = doc.frontmatter;
  const crumbs = [
    { label: "Головна", href: "/" },
    { label: "Гайди", href: "/guides" },
    { label: HUBS[doc.hub].label, href: `/${doc.hub}` },
    ...(doc.isPillar ? [] : [{ label: fm.title, href: doc.path }]),
  ];

  return (
    <article>
      <header className="max-w-3xl">
        <nav aria-label="Хлібні крихти" className="flex flex-wrap gap-x-2 gap-y-1 text-sm text-[var(--color-text-faint)]">
          {crumbs.map((crumb, index) => (
            <span key={crumb.href} className="inline-flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">/</span>}
              {index === crumbs.length - 1 ? (
                <span className="text-[var(--color-text-muted)]">{crumb.label}</span>
              ) : (
                <a href={crumb.href} className="hover:text-[var(--color-text)]">
                  {crumb.label}
                </a>
              )}
            </span>
          ))}
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--color-text)] sm:text-4xl">
          {fm.title}
        </h1>
        <p className="mt-3 text-lg text-[var(--color-text-muted)]">{fm.description}</p>
        <p className="mt-3 text-sm text-[var(--color-text-faint)]">{doc.readingMinutes} хв читання</p>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-12">
          <GuideMarkdown source={doc.body} />
          <FaqList items={fm.faq ?? []} />
          {fm.cta && (
            <a
              href={fm.cta.href}
              className="inline-flex rounded-[var(--radius-control)] bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-bg)] hover:bg-[var(--color-accent-strong)]"
            >
              {fm.cta.label}
            </a>
          )}
          {related.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold text-[var(--color-text)]">Далі по темі</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {related.map((item) => (
                  <li key={item.path}>
                    <a
                      href={item.path}
                      className="block rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-border-strong)]"
                    >
                      <div className="font-medium text-[var(--color-text)]">{item.title}</div>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">{item.description}</p>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Toc items={doc.toc} />
          </div>
        </aside>
      </div>
    </article>
  );
}
