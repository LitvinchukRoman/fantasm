import { ExplorerChart } from "~/components/admin/charts";
import { ChartPanel, PageHeading, RangePicker } from "~/components/admin/widgets";
import { requireAdmin } from "~/lib/admin.server";
import { getAdminOverview, routeApi } from "~/lib/api.server";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/admin.analytics";

export const meta = () => noindexSeo({ title: "Аналітика, Fantasm", description: "Серії та воронка Fantasm.", path: "/admin/analytics" });

export async function loader({ request }: Route.LoaderArgs) {
  await requireAdmin(request);
  const range = new URL(request.url).searchParams.get("range") ?? "30d";
  return routeApi(getAdminOverview(request, range));
}

export default function Analytics({ loaderData }: Route.ComponentProps) {
  const s = loaderData.series;
  const funnel = loaderData.funnel;
  const steps = [
    { label: "Відвідувачі", value: funnel.visitors },
    { label: "Увійшли", value: funnel.signedIn },
    { label: "Зробили дію", value: funnel.acted },
    { label: "Автори", value: funnel.authors },
  ];
  return (
    <div className="space-y-6">
      <PageHeading title="Аналітика" lede="Оберіть потрібні параметри у списку й спосіб, яким їх зібрати." aside={<RangePicker />} />
      <ChartPanel title="Динаміка за період">
        <ExplorerChart
          series={[
            { name: "Відвідувачі", points: s.visitors },
            { name: "Перегляди", points: s.pageviews },
            { name: "Активні", points: s.activeUsers },
            { name: "Реєстрації", points: s.signups },
            { name: "Ідеї", points: s.ideas },
            { name: "Голоси", points: s.votes },
            { name: "Пости", points: s.posts },
            { name: "Вступи", points: s.participations },
          ]}
        />
      </ChartPanel>
      <ChartPanel title="Воронка">
        <ol className="grid gap-px overflow-hidden rounded-[16px] border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => {
            const before = steps[index - 1]?.value;
            return (
              <li key={step.label} className="bg-[var(--color-bg)] px-5 py-4">
                <p className="text-sm text-[var(--color-text-muted)]">{step.label}</p>
                <p className="mt-2 text-3xl font-medium tracking-tight tabular-nums">{step.value}</p>
                <p className="mt-1 text-xs text-[var(--color-text-faint)]">
                  {before == null ? "усі, хто зайшов" : before > 0 ? `${Math.round((step.value / before) * 100)}% від попереднього кроку` : "попередній крок порожній"}
                </p>
              </li>
            );
          })}
        </ol>
      </ChartPanel>
    </div>
  );
}
