import { ExplorerChart } from "~/components/admin/charts";
import { ChartPanel, DataTable, HealthStrip, KpiCard, PageHeading, RangePicker, VerdictBanner } from "~/components/admin/widgets";
import { requireAdmin } from "~/lib/admin.server";
import { getAdminOverview, routeApi } from "~/lib/api.server";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/admin._index";

export const meta = () => noindexSeo({ title: "Огляд, Fantasm", description: "Чи росте платформа.", path: "/admin" });

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const range = new URL(request.url).searchParams.get("range") ?? "30d";
  return routeApi(getAdminOverview(request, range));
}

export default function Overview({ loaderData }: Route.ComponentProps) {
  const s = loaderData.series;
  return (
    <div className="space-y-6">
      <PageHeading title="Огляд" aside={<RangePicker />} />
      <VerdictBanner verdict={loaderData.verdict} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {loaderData.kpis.map((kpi) => <KpiCard key={kpi.key} label={kpi.label} value={kpi.value} previous={kpi.previous} delta={kpi.delta} />)}
      </div>
      <ChartPanel title="Відвідувачі й перегляди">
        <ExplorerChart shape="area" series={[
          { name: "Відвідувачі", points: s.visitors },
          { name: "Перегляди", points: s.pageviews },
        ]} />
      </ChartPanel>
      <ChartPanel title="Активні люди й реєстрації">
        <ExplorerChart series={[
          { name: "Активні", points: s.activeUsers },
          { name: "Реєстрації", points: s.signups },
        ]} />
      </ChartPanel>
      <ChartPanel title="Контент і залученість">
        <ExplorerChart series={[
          { name: "Ідеї", points: s.ideas },
          { name: "Голоси", points: s.votes },
          { name: "Пости", points: s.posts },
          { name: "Вступи", points: s.participations },
        ]} />
      </ChartPanel>
      <ChartPanel title="Модерація">
        <ExplorerChart series={[
          { name: "Надійшло", points: s.casesOpened },
          { name: "Вирішено", points: s.casesDecided },
        ]} />
        <h3 className="mt-8 mb-2 text-sm text-[var(--color-text-muted)]">Середній час до рішення, секунди</h3>
        <ExplorerChart shape="area" series={[{ name: "Секунди", points: s.decisionSeconds }]} />
      </ChartPanel>
      <ChartPanel title="Технічний стан">
        <ExplorerChart shape="area" series={[
          { name: "Запити", points: s.httpRequests },
          { name: "5xx", points: s.http5xx },
        ]} />
        <div className="mt-4"><HealthStrip health={loaderData.health} /></div>
      </ChartPanel>
      <div className="grid gap-3 md:grid-cols-2">
        <DataTable title="Сторінки" rows={loaderData.breakdowns.pages} />
        <DataTable title="Звідки прийшли" rows={loaderData.breakdowns.referrers} />
        <DataTable title="Категорії нових ідей" rows={loaderData.breakdowns.categories} />
        <DataTable title="Найпереглядуваніші ідеї" rows={loaderData.topIdeas.map((idea) => ({ key: idea.title || idea.slug, value: idea.views }))} />
      </div>
      <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <h2 className="text-base font-medium">Що помітно</h2>
        <ul className="mt-3 space-y-2 text-sm text-[var(--color-text-muted)]">
          {loaderData.insights.length === 0 && <li>Поки нічого не виділяється.</li>}
          {loaderData.insights.map((insight) => <li key={insight.text}>{insight.text}</li>)}
        </ul>
      </section>
    </div>
  );
}
