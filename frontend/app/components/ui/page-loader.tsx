import { useEffect, useState } from "react";
import logo192 from "~/assets/logo-192.webp";

/** Шрифт, що вантажиться довше, не має тримати контент закритим. */
const FONT_WAIT_MAX_MS = 1200;
/** Тривалість page-loader-out в app.css плюс запас, якщо animationend не прийде. */
const LEAVE_MS = 700;

// Модульний прапорець живе, поки живе вкладка: оверлей лише на першому
// завантаженні, а не на кожному клієнтському переході між layout-ами.
let firstLoadDone = false;

/**
 * Оверлей поверх готового SSG-HTML, поки не підвантажився шрифт.
 * Контент під ним є в DOM з першого байта (пошук і читалки його бачать).
 * Запобіжники на випадок, коли JS не виконався: CSS-анімація .page-loader
 * ховає оверлей сама (app.css), <noscript> у root.tsx прибирає його одразу,
 * prefers-reduced-motion не показує зовсім.
 * Поява й зникнення на CSS-анімаціях opacity: motion тут тягнув би ~40 КБ JS у перший екран.
 */
export function PageLoader({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<"shown" | "leaving" | "gone">(firstLoadDone ? "gone" : "shown");

  useEffect(() => {
    if (firstLoadDone) return;
    let cancelled = false;
    let delay = 0;
    let leave = 0;
    const hide = () => {
      if (cancelled) return;
      delay = window.setTimeout(() => {
        firstLoadDone = true;
        setPhase("leaving");
        leave = window.setTimeout(() => setPhase("gone"), LEAVE_MS);
      }, 150);
    };
    const cap = window.setTimeout(hide, FONT_WAIT_MAX_MS);
    if (document.fonts) {
      document.fonts.ready.then(() => {
        window.clearTimeout(cap);
        hide();
      });
    } else {
      window.clearTimeout(cap);
      hide();
    }
    return () => {
      cancelled = true;
      window.clearTimeout(cap);
      window.clearTimeout(delay);
      window.clearTimeout(leave);
    };
  }, []);

  return (
    <>
      {phase !== "gone" && (
        <div
          aria-hidden="true"
          data-leaving={phase === "leaving" ? "" : undefined}
          onAnimationEnd={(event) => {
            if (event.animationName === "page-loader-out") setPhase("gone");
          }}
          className="page-loader pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-bg)]"
        >
          <div className="page-loader-logo flex items-center justify-center">
            <img src={logo192} alt="" className="size-14 rounded-2xl opacity-20 grayscale" />
          </div>
        </div>
      )}
      {children}
    </>
  );
}
