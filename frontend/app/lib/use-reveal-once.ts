import { useEffect, useRef, useState } from "react";

/**
 * Скидає елемент у "доанімаційний" стан лише після гідратації на клієнті й
 * показує його, коли він з'являється у видимій області (IntersectionObserver,
 * не window.scroll — animate skill, розділ "Forbidden Animation Patterns").
 *
 * Без JS (SSR / пререндерений HTML) `ready` лишається false, тому елемент
 * рендериться у фінальному видимому вигляді — текст завжди присутній для
 * пошуку і для людей без JS, анімація лише прикрашає, коли є змога.
 */
export function useRevealOnce<T extends HTMLElement>(threshold = 0.35) {
  const ref = useRef<T | null>(null);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // Навмисний "hydration flag": відрізняє перший (SSR/пререндерений)
    // рендер від рендеру після гідратації на клієнті. Це і є синхронізація
    // з зовнішньою системою (наявність window/IntersectionObserver), тому
    // порушення тут очікуване, не помилка.
    // oxlint-disable-next-line react/set-state-in-effect
    setReady(true);
    const el = ref.current;
    if (!el) return;

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefersReducedMotion) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            observer.disconnect();
          }
        }
      },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);

  return { ref, ready, revealed };
}
