import { Button } from "~/components/ui/button";
import { useMemo } from "react";
import { Link } from "react-router";
import { formatDate } from "~/components/articles/shared";
import type { DocLink, DocView, Faq, TocItem } from "~/lib/content-meta";
import { docCrumbs } from "~/lib/structured-data";
import { GuideMarkdown } from "./markdown";
import { GuideTimeline } from "./guide-timeline";
import { Toc } from "./toc";

const FAQ_TOC_ITEM: TocItem = { depth: 2, text: "Часті запитання", id: "chasti-zapytannia" };

function FaqList({ items }: { items: Faq[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 id={FAQ_TOC_ITEM.id} className="scroll-mt-24 text-2xl font-semibold text-[var(--color-text)]">
        {FAQ_TOC_ITEM.text}
      </h2>
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

/**
 * `roadmap` — єдиний список-роадмеп під статтею. Лежить поза двоколонковою
 * сіткою (текст + зміст), тож на всю ширину контейнера й не впирається в колонку
 * змісту. На статті це «Далі по темі», на хабі — усі матеріали розділу.
 */
export function ArticleView({
  doc,
  roadmap,
  roadmapTitle = "Далі по темі",
}: {
  doc: DocView;
  roadmap: DocLink[];
  roadmapTitle?: string;
}) {
  const fm = doc.frontmatter;
  const crumbs = docCrumbs(doc);
  const hasFaq = (fm.faq?.length ?? 0) > 0;
  const tocItems = useMemo(() => (hasFaq ? [...doc.toc, FAQ_TOC_ITEM] : doc.toc), [doc.toc, hasFaq]);

  return (
    <article>
      <header className="max-w-3xl">
        <nav aria-label="Хлібні крихти" className="hud-label flex flex-wrap gap-x-2 gap-y-1">
          {crumbs.map((crumb, index) => (
            <span key={crumb.path} className="inline-flex items-center gap-2">
              {index > 0 && <span aria-hidden="true">/</span>}
              {index === crumbs.length - 1 ? (
                <span aria-current="page" className="text-[var(--color-text-muted)]">
                  {crumb.name}
                </span>
              ) : (
                <Link to={crumb.path} prefetch="intent" className="hover:text-[var(--color-text)]">
                  {crumb.name}
                </Link>
              )}
            </span>
          ))}
        </nav>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--color-text)] sm:text-4xl">
          {fm.title}
        </h1>
        <p className="mt-3 text-lg text-[var(--color-text-muted)]">{fm.description}</p>
        <p className="hud-label mt-4">
          {doc.readingMinutes} хв читання
          {fm.updatedAt ? (
            <>
              {" · оновлено "}
              <time dateTime={fm.updatedAt}>{formatDate(fm.updatedAt)}</time>
            </>
          ) : null}
        </p>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0 space-y-12">
          <GuideMarkdown html={doc.html} />
          <FaqList items={fm.faq ?? []} />
          {fm.cta && (
            <div>
              <Button to={fm.cta.href} arrow>
                {fm.cta.label}
              </Button>
            </div>
          )}
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <Toc items={tocItems} />
          </div>
        </aside>
      </div>

      {roadmap.length > 0 && (
        <section className="mt-20">
          <h2 className="text-xl font-semibold text-[var(--color-text)]">{roadmapTitle}</h2>
          <GuideTimeline items={roadmap} />
        </section>
      )}
    </article>
  );
}
