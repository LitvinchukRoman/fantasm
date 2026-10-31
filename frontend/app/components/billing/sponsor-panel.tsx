import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import type { IdeaSponsorship, SponsorTier, Tier } from "~/lib/api-types";
import { billingDate, money, sponsorsText } from "~/lib/billing";

type Result = { error?: string; code?: string };

/**
 * Спонсорство ідеї: щомісячна підписка відвідувача на ідею, яку хочеться бачити втіленою.
 * Автор бачить, хто його підтримує, решта лише кількість. Оплата тестова, картки не беремо.
 */
export function SponsorPanel({
  sponsorship,
  tiers,
  signedIn,
  mock,
}: {
  sponsorship: IdeaSponsorship;
  tiers: Tier[];
  signedIn: boolean;
  mock: boolean;
}) {
  const fetcher = useFetcher<Result>();
  const mine = sponsorship.mine;
  const [picked, setPicked] = useState<SponsorTier | null>(null);
  const [confirming, setConfirming] = useState(false);
  const busy = fetcher.state !== "idle";
  const isCurrent = (code: SponsorTier) => mine?.tier === code && !mine.cancelAtPeriodEnd;
  const chosen = tiers.find((tier) => tier.code === picked && !isCurrent(tier.code));

  if (sponsorship.own) {
    return (
      <div className="max-w-xl space-y-4">
        <p className="text-[var(--color-text-muted)]">
          {sponsorship.sponsors > 0 ? (
            <>
              У вашої ідеї <span className="tabular-nums text-[var(--color-text)]">{sponsorsText(sponsorship.sponsors)}</span>
              {sponsorship.monthlyMinor !== undefined && <> на <span className="tabular-nums text-[var(--color-text)]">{money(sponsorship.monthlyMinor)}</span> на місяць</>}.
            </>
          ) : (
            "Поки ніхто не спонсорує ідею. Коли хтось підтримає її підпискою, ви отримаєте сповіщення."
          )}
        </p>
        {sponsorship.supporters && sponsorship.supporters.length > 0 && (
          <ul className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
            {sponsorship.supporters.map((s) => (
              <li key={s.handle} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                <Link to={`/u/${s.handle}`} className="text-[var(--color-text)] [overflow-wrap:anywhere] hover:underline">{s.name}</Link>
                <span className="shrink-0 text-[var(--color-text-muted)]">{tiers.find((t) => t.code === s.tier)?.name ?? s.tier}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-[var(--color-text-muted)]">
        {sponsorship.sponsors > 0 ? <>У ідеї вже <span className="tabular-nums text-[var(--color-text)]">{sponsorsText(sponsorship.sponsors)}</span>. </> : null}
        {sponsorship.accepting
          ? "Щомісячна підписка показує автору, що ідея комусь потрібна, і допомагає її втілити."
          : "Ця ідея зараз не приймає нових спонсорів."}
      </p>

      {mine && (
        <p className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-text)]">
          Ви спонсор рівня «{mine.tierName}», {money(mine.priceMinor)} / міс.{" "}
          <span className="text-[var(--color-text-muted)]">
            {mine.cancelAtPeriodEnd ? `Скасовано, діє до ${billingDate(mine.currentPeriodEnd)}.` : `Продовження ${billingDate(mine.currentPeriodEnd)}.`}{" "}
            Керувати — у <Link to="/settings#pidpyska" className="underline-offset-4 hover:underline">налаштуваннях</Link>.
          </span>
        </p>
      )}

      {sponsorship.accepting && (
        <fetcher.Form method="post" className="space-y-3" onSubmit={() => setConfirming(false)}>
          <input type="hidden" name="intent" value="sponsor" />
          <fieldset>
            <legend className="sr-only">Рівень спонсорства</legend>
            <ul className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
              {tiers.map((tier) => {
                const current = isCurrent(tier.code);
                return (
                  <li key={tier.code}>
                    <label className={`flex cursor-pointer items-baseline gap-3 py-3 ${current ? "cursor-default opacity-60" : ""}`}>
                      <input
                        type="radio"
                        name="tier"
                        value={tier.code}
                        disabled={current || !signedIn}
                        checked={picked === tier.code && !current}
                        onChange={() => {
                          setPicked(tier.code);
                          setConfirming(false);
                        }}
                        className="accent-[var(--color-accent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-sm text-[var(--color-text)]">{tier.name}</span>
                        {current && <span className="text-xs text-[var(--color-text-muted)]"> · ваш рівень</span>}
                        <span className="block text-xs text-[var(--color-text-muted)]">{tier.perks.join(" · ")}</span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-[var(--color-text-muted)]">{money(tier.priceMinor)} / міс</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {!signedIn ? (
            <Button to="/login" variant="secondary">Увійти, щоб стати спонсором</Button>
          ) : confirming && chosen ? (
            <div className="rounded-xl border border-[var(--color-border-strong)] p-4">
              <p className="text-sm text-[var(--color-text)]">
                До сплати зараз: <span className="tabular-nums font-medium">{money(chosen.priceMinor)}</span>, далі щомісяця.
              </p>
              {mock && <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">Тестова оплата: картка не потрібна, гроші не списуються.</p>}
              <div className="mt-3 flex gap-2">
                <Button type="submit" size="sm" disabled={busy}>{busy ? "Оформлюю…" : "Підтвердити"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Скасувати</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" disabled={!chosen || busy} onClick={() => setConfirming(true)}>
              {mine ? "Змінити рівень" : "Стати спонсором"}
            </Button>
          )}
          {fetcher.data?.error && <p role="alert" className="text-sm text-red-400">{fetcher.data.error}</p>}
        </fetcher.Form>
      )}
    </div>
  );
}
