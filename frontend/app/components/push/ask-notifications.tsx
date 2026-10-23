import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "~/components/ui/button";
import { ensureSubscription, vapidPublicKey } from "~/lib/push";

const supported = () =>
  typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;

/**
 * Питаємо дозвіл один раз, одразу після того, як людина підтвердила профіль.
 * Сам запит лише з кнопки: без жесту браузер його ховає.
 */
export function AskNotifications({ next }: { next: string }) {
  const navigate = useNavigate();
  const [publicKey, setPublicKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported() || Notification.permission !== "default") {
      navigate(next, { replace: true });
      return;
    }
    let dead = false;
    vapidPublicKey()
      .then((key) => {
        if (dead) return;
        if (!key) navigate(next, { replace: true });
        else setPublicKey(key);
      })
      .catch(() => {
        if (!dead) navigate(next, { replace: true });
      });
    return () => {
      dead = true;
    };
  }, [navigate, next]);

  const leave = () => navigate(next, { replace: true });

  const allow = async () => {
    if (!publicKey || busy) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") await ensureSubscription(publicKey);
    } catch {
      /* далі все одно: увімкнути можна пізніше в профілі */
    }
    leave();
  };

  return (
    <div>
      <h1 className="text-center text-xl font-semibold text-[var(--color-text)]">Сповіщення в браузері</h1>
      <p className="mt-2 text-center text-sm text-[var(--color-text-muted)]">
        Коментар, голос чи запрошення в команду прийде сповіщенням, навіть якщо вкладку закрито.
      </p>
      <div className="mt-6">
        <Button type="button" className="w-full" disabled={busy} onClick={allow}>
          {busy ? "Вмикаю…" : "Увімкнути"}
        </Button>
        <a
          href={next}
          onClick={(event) => {
            event.preventDefault();
            leave();
          }}
          className="mt-3 block text-center text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
        >
          Не зараз
        </a>
      </div>
      <p className="mt-4 text-center text-xs text-[var(--color-text-faint)]">
        На iPhone це працює, якщо Fantasm додано на Початковий екран.
      </p>
    </div>
  );
}
