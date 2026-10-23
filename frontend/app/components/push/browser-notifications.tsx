import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { clearSubscription, ensureSubscription, vapidPublicKey } from "~/lib/push";

type Mode = "hidden" | "off" | "on" | "denied" | "error";

const supported = () =>
  typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

/**
 * Вмикає сповіщення браузера. Дозвіл питаємо лише з цього натискання:
 * запит без жесту браузер ховає, а на першому візиті ще й дратує.
 */
export function BrowserNotifications() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported()) return;
    let dead = false;
    vapidPublicKey()
      .then(async (key) => {
        if (dead) return;
        if (!key) return;
        setPublicKey(key);
        if (Notification.permission === "denied") {
          setMode("denied");
          return;
        }
        if (Notification.permission === "granted") {
          setMode((await ensureSubscription(key)) ? "on" : "error");
          return;
        }
        setMode("off");
      })
      .catch(() => {
        /* ключа немає — секцію не показуємо */
      });
    return () => {
      dead = true;
    };
  }, []);

  if (mode === "hidden") return null;

  const turnOn = async () => {
    setBusy(true);
    try {
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") {
        setMode(permission === "denied" ? "denied" : "off");
        return;
      }
      setMode((await ensureSubscription(publicKey)) ? "on" : "error");
    } catch {
      setMode("error");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      setMode((await clearSubscription()) ? "off" : "error");
    } catch {
      setMode("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-10 border-t border-[var(--color-border)] pt-8">
      <h2 className="text-sm font-medium text-[var(--color-text)]">Сповіщення браузера</h2>
      <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">
        Коментар, голос, заявка в команду, прийняття і рішення модератора приходять сповіщенням, навіть коли вкладка закрита.
      </p>
      {mode === "denied" ? (
        <p className="mt-3 text-sm text-[var(--color-text-muted)]">Браузер їх заблокував. Дозвольте сповіщення для цього сайту в його налаштуваннях.</p>
      ) : mode === "on" ? (
        <div className="mt-4 flex items-center gap-3">
          <p className="text-sm text-[var(--color-text-muted)]">Увімкнено в цьому браузері.</p>
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={turnOff}>
            {busy ? "Вимикаю…" : "Вимкнути"}
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <Button type="button" size="sm" disabled={busy || !publicKey} onClick={turnOn}>
            {busy ? "Вмикаю…" : "Увімкнути"}
          </Button>
          {mode === "error" && <p className="mt-2 text-sm text-red-400">Не вдалося. Спробуйте ще раз.</p>}
        </div>
      )}
      <p className="mt-3 text-xs text-[var(--color-text-faint)]">На iPhone це працює, якщо Fantasm додано на Початковий екран.</p>
    </section>
  );
}
