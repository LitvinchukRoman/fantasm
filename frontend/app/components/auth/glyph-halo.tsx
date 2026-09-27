import { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomGlyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
}

/** Однаковий перший кадр на сервері й у браузері, інакше гідрація падає. */
function seededGlyphs(count: number) {
  let seed = 0x9e3779b1;
  return Array.from({ length: count }, () => {
    seed = Math.imul(seed ^ (seed >>> 15), 0x85ebca6b);
    seed = Math.imul(seed ^ (seed >>> 13), 0xc2b2ae35);
    return GLYPHS[((seed ^ (seed >>> 16)) >>> 0) % GLYPHS.length];
  });
}

const COL_W = 14;
const ROW_H = 16;

export function GlyphHalo() {
  const ref = useRef<HTMLDivElement>(null);
  const colsRef = useRef(22);
  const [cols, setCols] = useState(22);
  const [cells, setCells] = useState(() => seededGlyphs(880));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      const nextCols = Math.max(16, Math.floor(width / COL_W));
      const rows = Math.max(24, Math.floor(height / ROW_H));
      const colsChanged = nextCols !== colsRef.current;
      if (colsChanged) {
        colsRef.current = nextCols;
        setCols(nextCols);
      }
      setCells((prev) => {
        const count = colsRef.current * rows;
        if (!colsChanged && prev.length === count) return prev;
        if (!colsChanged) {
          if (count > prev.length) {
            const extra = Array.from({ length: count - prev.length }, randomGlyph);
            return prev.concat(extra);
          }
          return prev.slice(0, count);
        }
        return Array.from({ length: count }, (_, index) => prev[index] ?? randomGlyph());
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => {
      setCells((prev) => {
        const next = prev.slice();
        const flips = Math.max(12, Math.floor(prev.length / 28));
        for (let i = 0; i < flips; i++) next[Math.floor(Math.random() * next.length)] = randomGlyph();
        return next;
      });
    }, 80);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      ref={ref}
      className="glyph-halo"
      aria-hidden="true"
      style={{ gridTemplateColumns: `repeat(${cols}, ${COL_W}px)` }}
    >
      {cells.map((glyph, index) => (
        <span key={index} className={index % 23 === 0 ? "is-hot" : undefined}>
          {glyph}
        </span>
      ))}
    </div>
  );
}
