import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useRevealOnce } from "~/lib/use-reveal-once";

/**
 * Список із картки clerk.com "Fraud and Abuse Prevention".
 * У джерела по конектору їде кольоровий meteor (компонент Meteor, stops
 * від прозорого червоного до orange) і по черзі зафарбовує маркери.
 * Тут та сама послідовність: лінія заливається зверху вниз крізь крапки,
 * і щойно доходить до крапки — фарбує її. Хрестик не використовуємо.
 * Заголовок і підпис з'являються в той самий момент, що й крапка.
 */

const LINE_MS = 1400;
const LEAD_MS = 280;

/** Поява з затримкою. Ховання миттєве: інакше пізній пункт лишається читабельним крізь блюр, поки лінія ще не дійшла. */
function revealStyle(show: boolean, delayMs: number): CSSProperties {
  return {
    opacity: show ? 1 : 0,
    filter: show ? "blur(0px)" : "blur(12px)",
    transform: show ? "translateY(0)" : "translateY(0.5rem)",
    transitionProperty: "opacity, filter, transform",
    transitionDuration: show ? "500ms" : "0ms",
    transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
    transitionDelay: show ? `${delayMs}ms` : "0ms",
  };
}

type ChecklistItem = {
  title: string;
  caption: string;
};

export function ChecklistX({
  items,
  className,
}: {
  items: ChecklistItem[];
  className?: string;
}) {
  const { ref, ready, revealed } = useRevealOnce<HTMLDivElement>(0.65);
  const show = !ready || revealed; // без JS / до гідратації — видимий фінальний стан
  const ulRef = useRef<HTMLUListElement>(null);
  const [fractions, setFractions] = useState<number[]>(() =>
    items.map((_, index) => index / Math.max(1, items.length - 1)),
  );
  /** Лінія тягнеться від центру першої крапки до центру останньої, а не до низу списку: підпис останнього пункту може бути в кілька рядків. */
  const [line, setLine] = useState<{ top: number; height: number } | null>(null);

  useLayoutEffect(() => {
    const ul = ulRef.current;
    if (!ul) return;
    const measure = () => {
      const dots = [...ul.querySelectorAll<HTMLElement>("[data-dot]")];
      if (dots.length === 0) return;
      const ulTop = ul.getBoundingClientRect().top;
      const centers = dots.map((dot) => dot.getBoundingClientRect().top + dot.offsetHeight / 2 - ulTop);
      const top = centers[0];
      const height = Math.max(1, centers[centers.length - 1] - top);
      setLine({ top, height });
      setFractions(centers.map((center) => Math.min(1, Math.max(0, (center - top) / height))));
    };
    measure();
    // Підписи переносяться інакше при зміні ширини: перемірюємо.
    const observer = new ResizeObserver(measure);
    observer.observe(ul);
    return () => observer.disconnect();
  }, [items]);

  return (
    <div
      ref={ref}
      className={
        "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-7 " +
        (className ?? "")
      }
    >
      <ul ref={ulRef} className="relative space-y-5">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[9px] w-0.5"
          style={line ? { top: line.top, height: line.height } : { top: 12, bottom: 12 }}
        >
          <span className="absolute inset-0 bg-[var(--color-border-strong)]" />
          <span
            className="absolute inset-0 origin-top bg-[var(--color-accent)]"
            style={{
              transform: show ? "scaleY(1)" : "scaleY(0)",
              transition: show
                ? `transform ${LINE_MS}ms linear ${LEAD_MS}ms`
                : "none",
            }}
          />
        </span>

        {items.map((item, index) => {
          const delay = LEAD_MS + (fractions[index] ?? 0) * LINE_MS;
          return (
            <li key={item.title} className="relative flex gap-4">
              <span data-dot="" className="relative z-10 mt-0.5 size-5 flex-none">
                <span className="absolute inset-0 rounded-full bg-[var(--color-surface)] ring-1 ring-[var(--color-border-strong)]" />
                <span
                  className="absolute inset-0 origin-center rounded-full bg-[var(--color-accent)]"
                  style={{
                    transform: show ? "scale(1)" : "scale(0)",
                    transition: show
                      ? `transform 320ms cubic-bezier(0.23, 1, 0.32, 1) ${delay}ms`
                      : "none",
                  }}
                />
              </span>

              <div className="min-w-0">
                <p
                  className="font-medium text-[var(--color-text)]"
                  style={revealStyle(show, delay)}
                >
                  {item.title}
                </p>
                <p
                  className="mt-0.5 text-sm text-[var(--color-text-muted)]"
                  style={revealStyle(show, delay + 80)}
                >
                  {item.caption}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
