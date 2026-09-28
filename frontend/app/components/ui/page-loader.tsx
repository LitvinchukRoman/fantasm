import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

/** Шрифт, що вантажиться довше, не має тримати контент закритим. */
const FONT_WAIT_MAX_MS = 1200;

// Модульний прапорець живе, поки живе вкладка: оверлей лише на першому
// завантаженні, а не на кожному клієнтському переході між layout-ами.
let firstLoadDone = false;

/**
 * Оверлей поверх готового SSG-HTML, поки не підвантажився шрифт.
 * Контент під ним є в DOM з першого байта (пошук і читалки його бачать).
 * Запобіжники на випадок, коли JS не виконався: CSS-анімація .page-loader
 * ховає оверлей сама (app.css), <noscript> у root.tsx прибирає його одразу,
 * prefers-reduced-motion не показує зовсім.
 */
export function PageLoader({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(!firstLoadDone);

  useEffect(() => {
    if (firstLoadDone) return;
    let cancelled = false;
    let delay = 0;
    const hide = () => {
      if (cancelled) return;
      delay = window.setTimeout(() => {
        firstLoadDone = true;
        setVisible(false);
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
    };
  }, []);

  return (
    <>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="page-loader"
            aria-hidden="true"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="page-loader pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-[var(--color-bg)]"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, duration: 0.8, ease: "easeOut" }}
              className="flex items-center justify-center"
            >
              <img src="/favicon.jpg" alt="" className="size-14 rounded-2xl opacity-20 grayscale" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </>
  );
}
