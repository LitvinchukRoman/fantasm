import { Link, useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import type { BillingOverview } from "~/lib/api-types";
import { billingDate, money, usageText } from "~/lib/billing";

type Result = { billing?: { error?: string } };

const STATUS_LINK = "text-xs text-[var(--color-text-faint)] underline-offset-4 hover:text-[var(--color-text)] hover:underline";

/** Одна дія з підтвердженням браузера: скасування не має ховатись за випадковим натисканням. */
function BillingAction({ intent, label, confirm, id }: { intent: string; label: string; confirm?: string; id?: string }) {
  const fetcher = useFetcher<Result>();
  return (
    <fetcher.Form
      method="post"
      action="/settings"
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="intent" value={intent} />
      {id && <input type="hidden" name="id" value={id} />}
      <button type="submit" disabled={fetcher.state !== "idle"} className={STATUS_LINK}>
        {fetcher.state === "idle" ? label : "Зачекайте…"}
      </button>
      {fetcher.data?.billing?.error && <p role="alert" className="mt-1 text-xs text-red-400">{fetcher.data.billing.error}</p>}
    </fetcher.Form>
  );
}

/**
 * Розділ «Підписка» в налаштуваннях: план, ліміт, спонсорства, історія платежів.
 * Оплата поки тестова, про це кажемо прямо, щоб ніхто не шукав списання на картці.
 */
export function SubscriptionPanel({ billing }: { billing: BillingOverview }) {
  const { plan, usage } = billing;
  const paid = plan.code !== "FREE";

  return (
    <section id="pidpyska" className="mt-10 scroll-mt-28 border-t border-[var(--color-border)] pt-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-[var(--color-text)]">Підписка</h2>
        {billing.mock && <span className="text-xs text-[var(--color-text-faint)]">тестова оплата</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-lg font-medium text-[var(--color-text)]">{plan.name}</span>
        {paid && <span className="text-sm tabular-nums text-[var(--color-text-muted)]">{money(plan.priceMinor)} / міс</span>}
      </div>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        {usageText(usage.activeIdeas, usage.limit)}
        {paid && plan.currentPeriodEnd && (
          <> · {plan.cancelAtPeriodEnd ? "діє до" : "наступне продовження"} {billingDate(plan.currentPeriodEnd)}</>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button to="/pricing" variant="secondary" size="sm">{paid ? "Змінити план" : "Більше ідей одночасно"}</Button>
        {paid && !plan.cancelAtPeriodEnd && (
          <BillingAction
            intent="plan-cancel"
            label="Скасувати підписку"
            confirm={`План «${plan.name}» діятиме до кінця оплаченого періоду, далі повернеться безкоштовний. Скасувати?`}
          />
        )}
        {paid && plan.cancelAtPeriodEnd && <BillingAction intent="plan-resume" label="Відновити підписку" />}
      </div>

      {billing.sponsorships.length > 0 && (
        <>
          <h3 className="mt-8 text-xs text-[var(--color-text-muted)]">Ви спонсоруєте</h3>
          <ul className="mt-2 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
            {billing.sponsorships.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
                <span className="min-w-0">
                  <Link to={`/ideas/${s.idea.slug}`} className="text-sm text-[var(--color-text)] [overflow-wrap:anywhere] hover:underline">
                    {s.idea.title}
                  </Link>
                  <span className="block text-xs text-[var(--color-text-muted)]">
                    {s.tierName} · {money(s.priceMinor)} / міс · {s.cancelAtPeriodEnd ? "до" : "продовження"} {billingDate(s.currentPeriodEnd)}
                  </span>
                </span>
                {!s.cancelAtPeriodEnd && (
                  <BillingAction
                    intent="sponsorship-cancel"
                    id={s.id}
                    label="Скасувати"
                    confirm={`Спонсорство «${s.idea.title}» діятиме до кінця оплаченого місяця. Скасувати?`}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {billing.payments.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]">Історія платежів</summary>
          <ul className="mt-2 space-y-1.5">
            {billing.payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-4 text-xs text-[var(--color-text-muted)]">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {billingDate(p.createdAt)} · {p.description}
                </span>
                <span className="shrink-0 tabular-nums">
                  {p.status === "REFUNDED" ? <s>{money(p.amountMinor)}</s> : money(p.amountMinor)}
                  {p.status === "REFUNDED" && " повернено"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="mt-6 text-xs text-[var(--color-text-faint)]">
        Питання щодо оплати чи повернення? <Link to="/help?topic=billing" className="underline-offset-4 hover:underline">Напишіть у підтримку</Link>: асистент бачить вашу підписку й може її змінити.
      </p>
    </section>
  );
}
