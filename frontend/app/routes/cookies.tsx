import { GuideFrame } from "~/components/guides/frame";
import { Button } from "~/components/ui/button";
import { openConsentSettings, useConsent } from "~/lib/consent";
import { seo } from "~/lib/seo";

const TITLE = "Cookies, Fantasm";
const DESCRIPTION = "Які cookies ставить Fantasm, навіщо і як змінити свій вибір щодо аналітики.";

export const meta = () => seo({ title: TITLE, description: DESCRIPTION, path: "/cookies" });

/** Строки збігаються з бекендом (identity.SessionTTL, LoginTTL) і consent.ts. Змінили там, змініть тут. */
const COOKIES = [
  {
    name: "__Host-fantasm_session",
    purpose: "Тримає вас в акаунті після входу через Google чи Microsoft.",
    lifetime: "До 30 днів, або 7 днів без візитів",
    kind: "Необхідна",
  },
  {
    name: "__Host-fantasm_login",
    purpose: "Захищає вхід: повʼязує повернення від Google чи Microsoft з вашим браузером.",
    lifetime: "10 хвилин",
    kind: "Необхідна",
  },
  {
    name: "fantasm_consent",
    purpose: "Памʼятає вашу відповідь у банері, щоб не питати на кожній сторінці.",
    lifetime: "6 місяців",
    kind: "Необхідна",
  },
  {
    name: "_ga, _ga_SBRF7E3C29",
    purpose: "Google Analytics: рахує відвідування і показує, які сторінки корисні. Лише після вашої згоди.",
    lifetime: "До 2 років",
    kind: "Аналітика",
  },
];

export default function Cookies() {
  const consent = useConsent();
  const status =
    consent === "granted" ? "Аналітику дозволено." : consent === "denied" ? "Аналітику вимкнено." : "Ви ще не обрали.";

  return (
    <GuideFrame>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-text)] sm:text-4xl">Cookies</h1>
        <p className="mt-4 text-lg text-[var(--color-text-muted)]">
          Fantasm ставить лише ті cookies, без яких не працює вхід, і аналітичні, якщо ви на них погодились.
          Рекламних cookies немає, дані для реклами в Google ми не передаємо.
        </p>

        <ul className="mt-10 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
          {COOKIES.map((cookie) => (
            <li key={cookie.name} className="grid gap-1 py-5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:gap-6">
              <div>
                <code className="text-sm text-[var(--color-text)] [overflow-wrap:anywhere]">{cookie.name}</code>
                <div className="hud-label mt-1">{cookie.kind}</div>
              </div>
              <div>
                <p className="text-[var(--color-text-muted)]">{cookie.purpose}</p>
                <p className="mt-1 text-sm text-[var(--color-text-faint)]">Строк: {cookie.lifetime}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Button variant="secondary" onClick={openConsentSettings}>
            Змінити вибір
          </Button>
          {consent !== undefined && <span className="text-sm text-[var(--color-text-muted)]">{status}</span>}
        </div>
      </div>
    </GuideFrame>
  );
}
