import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Нескінченна вертикальна стрічка з вигином (як на saifullah.dev/projects, реалізація своя).
 *
 * Колесо й стрілки рухають цільовий зсув, поточний наздоганяє його з інерцією. Кожен рядок стоїть
 * у своїй позиції по модулю (`wrap`), тож стрічка зациклена. Рядок повертається навколо горизонтальної
 * осі пропорційно відстані до центру екрана, відсувається вглиб, а біля країв тьмяніє. Сила вигину
 * залежить від швидкості скролу: у спокої рядки рівні, при русі стрічка вигинається як циліндр.
 */

const PERSPECTIVE = 1200;
const SPREAD = Math.PI / 6;
const BASE_OFFSET = 120;
const MAX_TILT = Math.PI / 2;
/** Швидкість (px/кадр), за якої вигин максимальний. */
const FULL_BEND_SPEED = 35;

const wrap = (min: number, max: number, value: number) => {
  const range = max - min;
  return ((((value - min) % range) + range) % range) + min;
};
const round = (value: number) => Math.round(value * 1000) / 1000;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function CurvedRows<T>({
  items,
  keyOf,
  renderRow,
}: {
  items: T[];
  keyOf: (item: T) => string;
  renderRow: (item: T, index: number, decorative: boolean) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Скільки разів повторити список, щоб стрічка заповнювала екран і при короткому списку.
  const [repeat, setRepeat] = useState(1);

  const count = items.length;
  const rows = Array.from({ length: count * repeat }, (_, index) => ({
    item: items[index % count],
    index,
    copy: Math.floor(index / count),
  }));

  useEffect(() => {
    const root = rootRef.current;
    const rowEls = rowRefs.current.slice(0, count * repeat).filter((el): el is HTMLDivElement => el !== null);
    if (!root || rowEls.length === 0 || count === 0) return;

    let rowHeight = rowEls[0].offsetHeight - 1;
    if (rowHeight <= 0) return;

    const needed = Math.ceil((window.innerHeight * 1.6) / (count * rowHeight));
    if (needed > repeat) {
      setRepeat(needed);
      return;
    }

    let total = rowEls.length * rowHeight;
    let half = window.innerHeight / 2;
    let target = BASE_OFFSET;
    let position = 0;
    let previous = 0;
    let intensity = 0;
    let gentle = false;
    let scrolling = false;
    let frame = 0;
    let gentleTimer = 0;
    let lastWheel = performance.now();
    let last = performance.now();

    const layout = (offset: number, velocity: number, bend: number) => {
      rowEls.forEach((el, index) => {
        const y = wrap(-rowHeight, total - rowHeight, index * rowHeight + offset);
        const angle = ((y + rowHeight / 2 - half) / half) * SPREAD;
        const tilt = clamp(angle, -MAX_TILT, MAX_TILT);
        const z = round((Math.cos(tilt) - 1) * PERSPECTIVE * bend);
        const rotateX = round(-((180 / Math.PI) * tilt) * bend);
        const drift = clamp(velocity, -40, 40);
        const skew = round(0.06 * drift);
        const rotateZ = round(0.04 * drift);
        const opacity = round(1 - Math.min(1, 0.45 * Math.abs(angle / SPREAD)));
        el.style.transform = `perspective(${PERSPECTIVE}px) translate3d(0, ${round(y)}px, ${z}px) rotateX(${rotateX}deg) rotateZ(${rotateZ}deg) skewY(${skew}deg)`;
        el.style.opacity = String(opacity);
      });
    };

    rowEls.forEach((el) => el.classList.add("is-ready"));
    layout(0, 0, 0);

    const tick = (now: number) => {
      const dt = Math.min(3, (now - last) / 16.666);
      last = now;
      position += (gentle ? 0.15 : 0.075) * dt * (target - position);
      const velocity = position - previous;
      previous = position;

      const speed = Math.min(1, Math.abs(velocity) / FULL_BEND_SPEED);
      intensity += (speed > intensity ? 0.05 : 0.035) * dt * (speed - intensity);

      const absVelocity = Math.abs(velocity);
      if (absVelocity > 0.5) {
        if (!scrolling) {
          root.classList.add("is-scrolling");
          scrolling = true;
        }
      } else if (absVelocity < 0.08 && scrolling) {
        root.classList.remove("is-scrolling");
        scrolling = false;
      }

      if (Math.abs(target - position) > 0.01 || absVelocity > 0.01 || intensity > 0.001) {
        layout(position, velocity, intensity);
        frame = requestAnimationFrame(tick);
      } else {
        position = previous = target;
        intensity = 0;
        layout(target, 0, 0);
        frame = 0;
      }
    };

    const kick = () => {
      if (frame || document.hidden) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    kick();

    const onWheel = (event: WheelEvent) => {
      if ((event.target as Element | null)?.closest?.("[data-curve-ignore]")) return;
      event.preventDefault();
      const now = performance.now();
      const since = now - lastWheel;
      lastWheel = now;
      let delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 40;
      else if (event.deltaMode === 2) delta *= 800;
      // Трекпад шле дрібні дробові кроки: для нього менший множник і швидша інерція.
      if (!Number.isInteger(event.deltaY) || Math.abs(event.deltaY) < 20 || (since > 0 && since < 40)) gentle = true;
      window.clearTimeout(gentleTimer);
      gentleTimer = window.setTimeout(() => {
        gentle = false;
      }, 200);
      target -= gentle ? 0.5 * delta : 1.5 * delta;
      kick();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const el = event.target as HTMLElement | null;
      if (el?.closest?.("input, textarea, select, [data-curve-ignore]")) return;
      let step = 0;
      if (event.key === "ArrowDown") step = -rowHeight;
      else if (event.key === "ArrowUp") step = rowHeight;
      else if (event.key === "PageDown") step = -window.innerHeight * 0.8;
      else if (event.key === "PageUp") step = window.innerHeight * 0.8;
      else return;
      event.preventDefault();
      target += step;
      kick();
    };

    // Фокус з клавіатури (Tab): підвести сфокусований рядок до центру екрана по найкоротшому шляху.
    const onFocus = (event: FocusEvent) => {
      const el = event.target as HTMLElement | null;
      const index = rowEls.findIndex((row) => row.contains(el));
      if (index < 0) return;
      const y = wrap(-rowHeight, total - rowHeight, index * rowHeight + target);
      let delta = half - rowHeight / 2 - y;
      delta = wrap(-total / 2, total / 2, delta);
      target += delta;
      kick();
    };

    const onResize = () => {
      rowHeight = (rowEls[0]?.offsetHeight ?? 0) - 1;
      if (rowHeight <= 0) return;
      total = rowEls.length * rowHeight;
      half = window.innerHeight / 2;
      layout(position, 0, intensity);
    };

    const onVisibility = () => {
      if (document.hidden) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      } else if (Math.abs(target - position) > 0.01 || intensity > 0.001) kick();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKey);
    root.addEventListener("focusin", onFocus);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(gentleTimer);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKey);
      root.removeEventListener("focusin", onFocus);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      root.classList.remove("is-scrolling");
    };
  }, [count, repeat]);

  return (
    <>
      <div ref={rootRef} className="ideas-stage">
        <div className="idea-rows idea-rows--curved">
          {rows.map(({ item, index, copy }) => (
            <div
              key={`${keyOf(item)}:${copy}`}
              ref={(el) => {
                rowRefs.current[index] = el;
              }}
              className="idea-abs-row"
              aria-hidden={copy > 0 || undefined}
              inert={copy > 0 || undefined}
            >
              <div className="idea-rail">{renderRow(item, index % count, copy > 0)}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
