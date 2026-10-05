import { useEffect, useRef, type ReactNode } from "react";

const HEADROOM = 96;
const FOOTROOM = 96;
const MAX_SAG = 72;

/**
 * Межі сірої шторки — дві квадратичні криві, верхня і нижня. Лівий і правий краї
 * стоять на швах сторінки і не відхиляються. Рухаються тільки центри:
 * середина кожної межі йде за напрямком руху змісту. Скрол угору прогинає її вниз,
 * скрол униз піднімає. Верх відкриває сферу, низ відкриває фон під закликом.
 * Текст у .page-sheet-content цим зсувом не чіпається.
 * Елементи з `data-sheet-hole` вирізаються зі шторки (evenodd), тож крізь них видно фонову сцену.
 * Радіус отвору береться з `border-radius` елемента.
 * У спокої криві повертаються до прямих. Крок згладжений, без ривка в нуль.
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
    let topSag = 0;
    let bottomSag = 0;
    let raf = 0;
    let running = false;
    let holes = "";

    /** Отвори в координатах SVG: відлік від верху шторки плюс HEADROOM. */
    const measureHoles = () => {
      const base = sheet.getBoundingClientRect();
      const parts: string[] = [];
      sheet.querySelectorAll<HTMLElement>("[data-sheet-hole]").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const x = r.left - base.left;
        const y = r.top - base.top + HEADROOM;
        const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r.width / 2, r.height / 2);
        const x1 = x + r.width;
        const y1 = y + r.height;
        parts.push(
          `M${x + radius} ${y}H${x1 - radius}A${radius} ${radius} 0 0 1 ${x1} ${y + radius}V${y1 - radius}A${radius} ${radius} 0 0 1 ${x1 - radius} ${y1}H${x + radius}A${radius} ${radius} 0 0 1 ${x} ${y1 - radius}V${y + radius}A${radius} ${radius} 0 0 1 ${x + radius} ${y}Z`,
        );
      });
      holes = parts.join("");
    };

    const paint = (top: number, bottom: number) => {
      const w = Math.max(1, sheet.clientWidth);
      const sheetH = sheet.clientHeight;
      const h = sheetH + HEADROOM + FOOTROOM;
      const y0 = HEADROOM;
      const y1 = HEADROOM + sheetH;
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      path.setAttribute(
        "d",
        `M0 ${y0} Q${w / 2} ${y0 + top} ${w} ${y0} L${w} ${y1} Q${w / 2} ${y1 + bottom} 0 ${y1} Z${holes}`,
      );
    };

    const clamp = (value: number) => Math.max(-MAX_SAG, Math.min(MAX_SAG, value));

    const tick = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;

      if (reduced.matches) {
        topSag = 0;
        bottomSag = 0;
        velocity = 0;
        paint(0, 0);
        running = false;
        return;
      }

      velocity = velocity * 0.82 + dy * 0.18;
      const rect = sheet.getBoundingClientRect();
      const vh = window.innerHeight;
      const topNear = rect.top < vh * 1.2 && rect.top > -vh;
      const bottomNear = rect.bottom < vh * 1.2 && rect.bottom > -vh;
      const target = clamp(-velocity * 6);
      topSag += ((topNear ? target : 0) - topSag) * 0.14;
      bottomSag += ((bottomNear ? target : 0) - bottomSag) * 0.14;
      paint(topSag, bottomSag);

      const moving = Math.abs(topSag) > 0.4 || Math.abs(bottomSag) > 0.4;
      if (moving || Math.abs(velocity) > 0.15 || Math.abs(dy) > 0.5) {
        raf = requestAnimationFrame(tick);
      } else {
        topSag = 0;
        bottomSag = 0;
        velocity = 0;
        paint(0, 0);
        running = false;
      }
    };

    const kick = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    const relayout = () => {
      measureHoles();
      paint(topSag, bottomSag);
    };
    measureHoles();
    paint(0, 0);
    const resize = new ResizeObserver(relayout);
    resize.observe(sheet);
    sheet.querySelectorAll("[data-sheet-hole]").forEach((el) => resize.observe(el));
    window.addEventListener("resize", relayout);
    void document.fonts?.ready.then(relayout);
    window.addEventListener("scroll", kick, { passive: true });
    reduced.addEventListener("change", kick);

    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", relayout);
      reduced.removeEventListener("change", kick);
    };
  }, []);

  return (
    <div ref={sheetRef} className="page-sheet">
      <svg ref={svgRef} className="page-curtain" aria-hidden="true">
        <path ref={pathRef} fill="var(--color-sheet)" fillRule="evenodd" />
      </svg>
      <div className="page-sheet-content">{children}</div>
    </div>
  );
}
