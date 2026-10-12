import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Button } from "~/components/ui/button";
import { onConsentSettingsOpen, saveConsent, useConsent, type Consent } from "~/lib/consent";

/**
 * Банер згоди на cookies і аналітику. Не блокує сторінку, але лишається, доки людина не відповість.
 * «Лише необхідні» стоїть поруч і того ж розміру, що «Дозволити»: відмова має бути не важчою за згоду.
 * Кнопки не переносять рядок, тож до 400 px вони стоять одна під одною, інакше «Лише необхідні» не влазить.
 * Над доком дій (z-40), бо до відповіді це головне, що бачить нова людина.
 */
export function ConsentBanner() {
  const consent = useConsent();
  const [reopened, setReopened] = useState(false);

  useEffect(() => onConsentSettingsOpen(() => setReopened(true)), []);

  if (consent === undefined || (consent !== null && !reopened)) return null;

  const choose = (value: Consent) => {
    saveConsent(value);
    setReopened(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      aria-describedby="consent-text"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:right-auto sm:left-0 sm:max-w-md sm:pb-5 sm:pl-5"
    >
      <div className="rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-bg)]/90 p-5 shadow-[0_16px_40px_rgb(0_0_0/0.5)] backdrop-blur-2xl saturate-150">
        <p id="consent-title" className="font-medium text-[var(--color-text)]">
          Cookies на Fantasm
        </p>
        <p id="consent-text" className="mt-2 text-sm text-[var(--color-text-muted)]">
          Необхідні cookies тримають вас в акаунті, без них вхід не працює. Аналітичні cookies Google Analytics
          вмикаємо лише з вашої згоди: вони показують, які сторінки корисні. Рекламних cookies немає.{" "}
          <Link to="/cookies" className="text-[var(--color-text)] underline underline-offset-2 hover:text-[var(--color-accent)]">
            Докладніше
          </Link>
        </p>
        <div className="mt-4 grid gap-2 min-[400px]:grid-cols-2">
          <Button size="sm" onClick={() => choose("granted")}>
            Дозволити
          </Button>
          <Button size="sm" variant="secondary" onClick={() => choose("denied")}>
            Лише необхідні
          </Button>
        </div>
      </div>
    </div>
  );
}
