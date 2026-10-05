import { useEffect, useState } from "react";

/**
 * Вигнута нескінченна стрічка потрібна лише там, де є колесо й наведення, і тільки без reduced motion.
 * Пререндер і мобільні отримують звичайний список тих самих рядків.
 */
export function useCurvedMode(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 1024px) and (hover: hover) and (pointer: fine)");
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
