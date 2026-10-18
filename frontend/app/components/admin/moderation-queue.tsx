import { Link, useFetcher, useLocation } from "react-router";
import { GuideMarkdown } from "~/components/guides/markdown";
import { PageHeading } from "~/components/admin/widgets";
import { Button } from "~/components/ui/button";
import type { ModerationHistoryItem, ModerationReport, QueueItem } from "~/lib/api-types";

type ModerationData = {
  tab: "history" | "queue";
  items: QueueItem[];
  nextCursor?: string | null;
  history: ModerationHistoryItem[];
  reports: ModerationReport[];
  reportsFor: string;
};

export function ModerationQueue({ loaderData }: { loaderData: ModerationData }) {
  const base = useLocation().pathname.startsWith("/admin") ? "/admin/moderation" : "/moderation";
  return (
    <div>
      <PageHeading
        title="Модерація"
        aside={
          <div className="flex gap-0.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-1 text-sm">
            <Link to={base} className={"rounded-full px-3.5 py-1.5 transition-[background-color,color] duration-150 " + (loaderData.tab === "queue" ? "bg-[var(--color-surface-strong)] text-[var(--color-text)]" : "text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]")}>Черга</Link>
            <Link to={`${base}?tab=history`} className={"rounded-full px-3.5 py-1.5 transition-[background-color,color] duration-150 " + (loaderData.tab === "history" ? "bg-[var(--color-surface-strong)] text-[var(--color-text)]" : "text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)]")}>Історія</Link>
          </div>
        }
      />
      {loaderData.tab === "history" ? (
        <History base={base} items={loaderData.history} next={loaderData.nextCursor} />
      ) : (
        <ul className="mt-8 space-y-5">
          {loaderData.items.length === 0 && <li className="text-[var(--color-text-muted)]">Черга порожня.</li>}
          {loaderData.items.map((item) => (
            <Item key={item.caseId} base={base} item={item} reports={loaderData.reportsFor === item.ideaId ? loaderData.reports : []} />
          ))}
          {loaderData.nextCursor && <Button to={`${base}?cursor=${encodeURIComponent(loaderData.nextCursor)}`} variant="secondary">Далі</Button>}
        </ul>
      )}
    </div>
  );
}

function Item({ item, reports, base }: { item: QueueItem; reports: ModerationReport[]; base: string }) {
  const fetcher = useFetcher<{ error?: string }>();
  return (
    <li className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
      <Link to={`/ideas/${item.slug}`} className="text-xl font-medium tracking-tight hover:text-[var(--color-accent)]">{item.title}</Link>
      <p className="mt-2 text-sm text-[var(--color-text-muted)]">
        {item.author.name} · карма {item.authorKarma ?? 0} · схвалених ідей {item.authorApprovedIdeas ?? 0} · скарг {item.openReports ?? 0} · {item.source}
      </p>
      {item.html && <div className="mt-4 max-h-64 overflow-auto rounded-[var(--radius-card)] border border-[var(--color-border)] p-3"><GuideMarkdown html={item.html} /></div>}
      <p className="mt-3"><Link to={`${base}?reports=${item.ideaId}`} className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">Скарги</Link></p>
      {reports.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-muted)]">
          {reports.map((report) => <li key={report.createdAt + report.reporter.handle}>{report.reporter.name}: {report.reason}</li>)}
        </ul>
      )}
      <fetcher.Form method="post" className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="id" value={item.ideaId} />
        <input name="note" maxLength={1000} placeholder="Примітка для автора" className="min-w-0 flex-1 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-4 py-2 text-sm outline-none placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-accent)]" />
        {([
          ["APPROVED", "Схвалити", "primary"],
          ["HIDDEN", "Сховати", "secondary"],
          ["REJECTED", "Відхилити", "secondary"],
        ] as const).map(([decision, label, variant]) => (
          <Button key={decision} type="submit" name="decision" value={decision} size="sm" variant={variant}>{label}</Button>
        ))}
      </fetcher.Form>
      {fetcher.data?.error && <p role="alert" className="mt-2 text-sm text-red-300">{fetcher.data.error}</p>}
    </li>
  );
}

function History({ items, next, base }: { items: ModerationHistoryItem[]; next?: string | null; base: string }) {
  const decision: Record<string, string> = { APPROVED: "Схвалено", HIDDEN: "Сховано", REJECTED: "Відхилено" };
  return (
    <ul className="mt-8 space-y-3 text-sm">
      {items.length === 0 && <li className="text-[var(--color-text-muted)]">Рішень ще немає.</li>}
      {items.map((item) => (
        <li key={item.caseId} className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <Link to={`/ideas/${item.slug}`} className="font-medium hover:text-[var(--color-accent)]">{item.title}</Link>
          <p className="mt-1 text-[var(--color-text-muted)]">{decision[item.decision] ?? item.decision} · {item.decidedBy.name} · {item.note || "без примітки"}</p>
        </li>
      ))}
      {next && <Button to={`${base}?tab=history&cursor=${encodeURIComponent(next)}`} variant="secondary">Далі</Button>}
    </ul>
  );
}
