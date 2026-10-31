import { useState } from "react";
import { data, Link, redirect, useFetcher } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { IconCheck } from "~/components/landing/icons";
import { Button } from "~/components/ui/button";
import { ApiError, getCurrentUser, routeApi } from "~/lib/api.server";
import type { BillingOverview, Plan, Tier } from "~/lib/api-types";
import { billingDate, isPaidPlan, money, usageText } from "~/lib/billing";
import { choosePlan, getBilling, getBillingCatalog, optional } from "~/lib/billing.server";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/pricing";

// Поки оплата тестова, сторінку не індексуємо й не додаємо в sitemap.
export const meta = () =>
  noindexSeo({
    title: "Плани, Fantasm",
    description: "Плани для авторів ідей і підписка, щоб спонсорувати ідеї, які хочеться бачити втіленими.",
    path: "/pricing",
  });

export async function loader({ request }: Route.LoaderArgs) {
  const [catalog, user] = await routeApi(Promise.all([getBillingCatalog(request), getCurrentUser(request)]));
  const billing = user ? await optional(getBilling(request)) : null;
  return { catalog, billing, signedIn: Boolean(user) };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const plan = form.get("plan");
  if (!isPaidPlan(plan)) return data({ error: "Оберіть план." }, { status: 400 });
  try {
    await choosePlan(request, plan);
    return data({ ok: true });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw redirect("/login");
    if (error instanceof ApiError) return data({ error: "Не вдалося змінити план. Спробуйте ще раз." }, { status: error.status });
    throw error;
  }
}

type ActionResult = { ok?: boolean; error?: string };

/**
 * Тестова «оплата»: підтвердження без картки. Коли підключимо справжній платіжний сервіс,
 * тут з'явиться його форма, а решта сторінки не зміниться.
 */
function Checkout({ plan, onCancel }: { plan: Plan; onCancel: () => void }) {
  const fetcher = useFetcher<ActionResult>();
  const busy = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post" className="mt-6 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg)] p-4">
      <input type="hidden" name="plan" value={plan.code} />
      <p className="text-sm text-[var(--color-text)]">
        До сплати зараз: <span className="tabular-nums font-medium">{money(plan.priceMinor)}</span>, далі щомісяця.
      </p>
      <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
        Тестова оплата: картка не потрібна, гроші не списуються. Скасувати можна будь-коли в налаштуваннях.
      </p>
      {fetcher.data?.error && <p role="alert" className="mt-2 text-sm text-red-400">{fetcher.data.error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={busy}>{busy ? "Оформлюю…" : "Підтвердити"}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Скасувати</Button>
      </div>
    </fetcher.Form>
  );
}

function PlanCard({
  plan,
  current,
  featured,
  signedIn,
}: {
  plan: Plan;
  current: BillingOverview["plan"] | undefined;
  featured: boolean;
  signedIn: boolean;
}) {
  const [checkout, setCheckout] = useState(false);
  const isCurrent = current?.code === plan.code;
  const resumable = isCurrent && current?.cancelAtPeriodEnd;

  let control: React.ReactNode;
  if (plan.code === "FREE") {
    control = isCurrent ? <p className="text-sm text-[var(--color-text-muted)]">Ваш план зараз</p> : null;
  } else if (!signedIn) {
    control = <Button to="/login" variant={featured ? "primary" : "secondary"} className="w-full">Увійти, щоб обрати</Button>;
  } else if (isCurrent && !resumable) {
    control = (
      <p className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
        <IconCheck className="size-4 text-[var(--color-accent)]" />
        Ваш план{current?.currentPeriodEnd ? ` до ${billingDate(current.currentPeriodEnd)}` : ""}
      </p>
    );
  } else if (checkout) {
    control = <Checkout plan={plan} onCancel={() => setCheckout(false)} />;
  } else {
    control = (
      <Button variant={featured ? "primary" : "secondary"} className="w-full" onClick={() => setCheckout(true)}>
        {resumable ? "Відновити" : `Обрати «${plan.name}»`}
      </Button>
    );
  }

  return (
    <li
      className={`flex flex-col rounded-[var(--radius-card)] border bg-[var(--color-surface)] p-6 ${
        featured ? "border-[var(--color-border-strong)]" : "border-[var(--color-border)]"
      }`}
    >
      <h2 className="text-xl font-medium tracking-tight text-[var(--color-text)]">{plan.name}</h2>
      <p className="mt-3 text-3xl font-medium tracking-tight tabular-nums text-[var(--color-text)]">
        {plan.priceMinor ? money(plan.priceMinor) : "Безкоштовно"}
        {plan.priceMinor > 0 && <span className="text-base font-normal text-[var(--color-text-muted)]"> / міс</span>}
      </p>
      <ul className="mt-6 flex-1 space-y-2.5">
        {plan.perks.map((perk) => (
          <li key={perk} className="flex gap-2 text-sm text-[var(--color-text-muted)]">
            <IconCheck className="mt-0.5 size-4 shrink-0 text-[var(--color-text-faint)]" />
            {perk}
          </li>
        ))}
      </ul>
      <div className="mt-8">{control}</div>
    </li>
  );
}

function TierRow({ tier }: { tier: Tier }) {
  return (
    <li className="grid gap-2 py-5 sm:grid-cols-[12rem_8rem_minmax(0,1fr)] sm:gap-6">
      <span className="font-medium text-[var(--color-text)]">{tier.name}</span>
      <span className="tabular-nums text-[var(--color-text-muted)]">{money(tier.priceMinor)} / міс</span>
      <span className="text-sm text-[var(--color-text-muted)]">{tier.perks.join(" · ")}</span>
    </li>
  );
}

export default function Pricing({ loaderData }: Route.ComponentProps) {
  // Після оформлення loader перезапускається сам, тож картки й рядок «Зараз у вас» уже нові.
  const { catalog, signedIn, billing } = loaderData;

  return (
    <GuideFrame>
      <div className="max-w-2xl">
        <p className="hud-label">Плани</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--color-text)] sm:text-4xl">
          Більше ідей одночасно і підтримка тих, у кого вони вже є
        </h1>
        <p className="mt-4 text-lg text-[var(--color-text-muted)]">
          Автори обирають план за кількістю ідей, над якими працюють одночасно. Чернетки й завершені ідеї в ліміт не входять.
        </p>
        {catalog.mock && (
          <p className="mt-4 inline-flex rounded-full border border-[var(--color-border)] px-3.5 py-1.5 text-xs text-[var(--color-text-muted)]">
            Тестовий режим: оплата імітована, картка не потрібна
          </p>
        )}
        {billing && (
          <p className="mt-6 text-sm text-[var(--color-text-muted)]">
            Зараз у вас план «{billing.plan.name}»: {usageText(billing.usage.activeIdeas, billing.usage.limit)}.{" "}
            <Link to="/settings#pidpyska" className="text-[var(--color-text)] underline-offset-4 hover:underline">Керувати підпискою</Link>
          </p>
        )}
      </div>

      <ul className="mt-12 grid gap-5 md:grid-cols-3">
        {catalog.plans.map((plan) => (
          <PlanCard key={plan.code} plan={plan} current={billing?.plan} featured={plan.code === "PLUS"} signedIn={signedIn} />
        ))}
      </ul>

      <section className="mt-20 max-w-4xl" aria-labelledby="sponsorship">
        <h2 id="sponsorship" className="text-2xl font-medium tracking-tight text-[var(--color-text)]">Спонсорство ідей</h2>
        <p className="mt-3 max-w-2xl text-[var(--color-text-muted)]">
          Бачите ідею, яку хочеться побачити втіленою? Станьте її спонсором на сторінці ідеї: це щомісячна підписка, яку можна
          скасувати будь-коли. Автор бачить своїх спонсорів, голос «Підтримати» лишається безкоштовним.
        </p>
        <ul className="mt-6 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {catalog.tiers.map((tier) => (
            <TierRow key={tier.code} tier={tier} />
          ))}
        </ul>
        <Button to="/ideas" variant="secondary" arrow className="mt-8">Обрати ідею</Button>
      </section>
    </GuideFrame>
  );
}
