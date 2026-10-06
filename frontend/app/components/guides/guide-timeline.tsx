import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router";

type TimelineItem = { path: string; title: string; description: string };

/** Висота точки від верху картки (px) — на рівні заголовка. */
const DOT_TOP = 28;

/** Детермінований «шум» 0..1 за номером відрізка: однаковий на сервері й клієнті, без Math.random. */
function noise(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

type Dot = { x: number; y: number };

/**
 * Відрізок між двома вузлами. Кожен має власний характер: різна «напруга» біля початку й кінця,
 * різний виступ убік проміжку. Через це довга лінія читається як жива течія, а не як один і той самий
 * вигин, що повторюється. `salt` дає окремий, але стабільний варіант (для тонкої другої нитки).
 */
function segmentPath(from: Dot, to: Dot, index: number, salt: number): string {
  const dy = to.y - from.y;
  const wide = Math.abs(to.x - from.x) > 2;
  const dir = wide ? Math.sign(to.x - from.x) : -1;
  // Скільки відрізка лінія лишається вертикальною біля кожного вузла (0.2 різкий вигин, 0.8 пологий).
  const tFrom = 0.22 + noise(index, salt) * 0.55;
  const tTo = 0.22 + noise(index, salt + 1) * 0.55;
  // Виступ убік проміжку: у широкому режимі до 34px (проміжок 96px), у вузькому легка хвиля до 9px.
  const reach = wide ? 34 : 9;
  const bFrom = noise(index, salt + 2) * reach;
  const bTo = noise(index, salt + 3) * reach;
  const c1x = from.x + dir * bFrom;
  const c2x = to.x - dir * bTo;
  return `M ${from.x} ${from.y} C ${c1x} ${from.y + dy * tFrom} ${c2x} ${to.y - dy * tTo} ${to.x} ${to.y}`;
}

/** Віха: перший, останній і кожен четвертий вузол крупніший, щоб довгий роадмеп мав ритм. */
function isMilestone(index: number, count: number): boolean {
  return index === 0 || index === count - 1 || index % 4 === 0;
}

/**
 * Список матеріалів у вигляді роадмепу: картки йдуть по черзі зліва й справа
 * (з вертикальним перекриттям — кожна наступна починається десь посередині
 * попередньої), а червона гнучка лінія хвилею тече між ними, згасаючи від вузла до вузла.
 *
 * Лінія торкається внутрішнього краю кожної картки в точці-«вузлі» з вертикальною
 * дотичною, тож вузол сидить прямо на краю картки (без окремих відрізків-стиків),
 * а між вузлами лінія плавно перетікає на інший бік. Шлях рахується з реальних
 * позицій карток (ResizeObserver), тому лишається цілісним при будь-якій довжині
 * тексту й ширині екрана.
 *
 * На вузьких екранах — одна колонка з прямою лінією біля лівого краю карток.
 */
export function GuideTimeline({ items }: { items: TimelineItem[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const uid = useId().replace(/:/g, "");
  const [dots, setDots] = useState<Dot[]>([]);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const origin = list.getBoundingClientRect();
      const wide = window.matchMedia("(min-width: 768px)").matches;
      const points = Array.from(
        list.querySelectorAll<HTMLElement>(":scope > li > a"),
      ).map((card, index) => {
        const rect = card.getBoundingClientRect();
        // Вузол — на краю, що дивиться в бік осі: у лівої колонки правий, у правої лівий.
        const edge = wide && index % 2 === 0 ? rect.right : rect.left;
        return { x: edge - origin.left, y: rect.top - origin.top + DOT_TOP };
      });
      if (points.length < 2) {
        setDots([]);
        return;
      }
      setDots(points);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    list
      .querySelectorAll(":scope > li > a")
      .forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [items]);

  return (
    <ul
      ref={listRef}
      className="relative mt-4 grid grid-cols-1 gap-y-6 md:grid-cols-2 md:gap-x-24 md:gap-y-0"
    >
      {items.map((item, index) => {
        const left = index % 2 === 0;
        return (
          <li
            key={item.path}
            // Десктоп: картка займає два рядки сітки, наступна стартує з другого —
            // так виходить шаховий зсув із різною висотою карток.
            style={
              { "--row": index + 1, "--col": left ? 1 : 2 } as CSSProperties
            }
            className={
              "relative self-start max-md:ml-5 md:pb-4 md:[grid-column:var(--col)] md:[grid-row:var(--row)/span_2]"
            }
          >
            <Link
              to={item.path}
              prefetch="intent"
              className="relative block rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 hover:border-[var(--color-border-strong)]"
            >
              <div className="font-medium text-[var(--color-text)]">
                {item.title}
              </div>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                {item.description}
              </p>
            </Link>
          </li>
        );
      })}
      {dots.length > 1 ? (
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          <defs>
            {dots.slice(1).map((to, index) => (
              // Кожен відрізок — «комета»: яскравий біля верхнього вузла, згасає до
              // нижнього. Лінія не однорідна, має ритм і напрям руху зверху вниз.
              <linearGradient
                key={index}
                id={`${uid}-seg-${index}`}
                gradientUnits="userSpaceOnUse"
                x1={0}
                x2={0}
                y1={dots[index].y}
                y2={to.y}
              >
                <stop
                  offset="0"
                  stopColor="var(--color-accent)"
                  stopOpacity={0.95}
                />
                <stop
                  offset="1"
                  stopColor="var(--color-accent)"
                  stopOpacity={0.14}
                />
              </linearGradient>
            ))}
          </defs>
          {dots.slice(1).map((to, index) => {
            const from = dots[index];
            return (
              <g key={index}>
                {/* Тонка друга нитка з іншим характером вигину: ледь помітна, додає глибини довгій лінії. */}
                <path
                  d={segmentPath(from, to, index, 20)}
                  fill="none"
                  stroke={`url(#${uid}-seg-${index})`}
                  strokeOpacity={0.4}
                  strokeWidth={1}
                  strokeDasharray="2 6"
                  strokeLinecap="round"
                />
                <path
                  d={segmentPath(from, to, index, 0)}
                  fill="none"
                  stroke={`url(#${uid}-seg-${index})`}
                  strokeWidth={1.25 + noise(index, 9) * 1}
                  strokeLinecap="round"
                />
              </g>
            );
          })}
          {dots.map((dot, index) => {
            const big = isMilestone(index, dots.length);
            return (
              <g key={index}>
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={big ? 14 : 9}
                  fill="var(--color-accent)"
                  fillOpacity={big ? 0.1 : 0.12}
                />
                {big && (
                  <circle
                    cx={dot.x}
                    cy={dot.y}
                    r={9}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeOpacity={0.45}
                    strokeWidth={1}
                  />
                )}
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={big ? 5.5 : 4}
                  fill="var(--color-accent)"
                  stroke="var(--color-bg)"
                  strokeWidth={2}
                />
              </g>
            );
          })}
        </svg>
      ) : null}
    </ul>
  );
}
