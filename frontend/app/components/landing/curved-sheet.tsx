import { useEffect, useRef, type ReactNode } from "react";

const HEADROOM = 96;
const MAX_SAG = 72;

/**
 * Межа сірої шторки — квадратична крива. Лівий і правий краї стоять
 * на шві сторінки і не відхиляються. Рухається тільки центр:
 * скрол угору прогинає його вниз і відкриває сферу, скрол униз — угору.
 * Текст у .page-sheet-content цим зсувом не чіпається.
 * У спокої крива повертається до прямої. Крок згладжений, без ривка в нуль.
 */
export function CurvedSheet({ children }: { children: ReactNode }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const sheet = sheetRef.current;
    const svg = svgRef.current;
    const path = pathRef.current;
    if (!sheet || !svg || !path) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastY = window.scrollY;
    let velocity = 0;
    let sag = 0;
    let raf = 0;
    let running = false;

    const paint = (next: number) => {
      const w = Math.max(1, sheet.clientWidth);
      const h = sheet.clientHeight + HEADROOM;
      const y0 = HEADROOM;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      path.setAttribute(
        "d",
        `M0 ${y0} Q${w / 2} ${y0 + next} ${w} ${y0} L${w} ${h} L0 ${h} Z`,
      );
    };

    const tick = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;

      if (reduced.matches) {
        sag = 0;
        velocity = 0;
        paint(0);
        running = false;
        return;
      }

      velocity = velocity * 0.82 + dy * 0.18;
      const top = sheet.getBoundingClientRect().top;
      const vh = window.innerHeight;
      const seamNear = top < vh * 1.2 && top > -vh;
      const target = seamNear ? Math.max(-MAX_SAG, Math.min(MAX_SAG, -velocity * 6)) : 0;
      sag += (target - sag) * 0.14;
      paint(sag);

      if (Math.abs(sag) > 0.4 || Math.abs(velocity) > 0.15 || Math.abs(dy) > 0.5) {
        raf = requestAnimationFrame(tick);
      } else {
        sag = 0;
        velocity = 0;
        paint(0);
        running = false;
      }
    };

    const kick = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    paint(0);
    const resize = new ResizeObserver(() => paint(sag));
    resize.observe(sheet);
    window.addEventListener("scroll", kick, { passive: true });
    reduced.addEventListener("change", kick);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      window.removeEventListener("scroll", kick);
      reduced.removeEventListener("change", kick);
    };
  }, []);

  return (
    <div ref={sheetRef} className="page-sheet">
      <svg ref={svgRef} className="page-curtain" aria-hidden="true">
        <path ref={pathRef} fill="#121316" />
      </svg>
      <div className="page-sheet-content">{children}</div>
    </div>
  );
}
