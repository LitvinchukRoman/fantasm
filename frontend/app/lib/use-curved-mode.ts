import { useEffect, useState } from "react";

/**
 * Вигнута нескінченна стрічка потрібна лише там, де є колесо й наведення, і тільки без reduced motion.
 * Пререндер і мобільні отримують звичайний список тих самих рядків.
 */
const WIDE_QUERY = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";

/** Синхронна версія для коду, якому не можна чекати на ефект (наприклад, відновлення скролу). */
export function canCurve(): boolean {
  return window.matchMedia(WIDE_QUERY).matches && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useCurvedMode(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia(WIDE_QUERY);
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(wide.matches && !calm.matches);
    update();
    wide.addEventListener("change", update);
    calm.addEventListener("change", update);
    return () => {
      wide.removeEventListener("change", update);
      calm.removeEventListener("change", update);
    };
  }, []);
  return enabled;
}
