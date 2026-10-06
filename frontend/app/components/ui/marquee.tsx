/**
 * Біжучий рядок між двома тонкими лініями (як назва проєкту на референсі).
 * Суто декоративний: текст уже є в h1, тому для читалок рядок прихований.
 * `.animate-marquee` вимикається при reduced motion, а рядок лишається статичним.
 */
/** Швидкість рядка в px/с: час обороту залежить від довжини тексту, а не фіксований, тож довга назва не мчить. */
const MARQUEE_SPEED = 32;

export function Marquee({ text, repeat = 6 }: { text: string; repeat?: number }) {
  const approxUnitWidth = repeat * (text.length * 40 + 64);
  const duration = Math.max(60, Math.round(approxUnitWidth / MARQUEE_SPEED));
  const unit = (
    <span className="flex shrink-0 items-center" aria-hidden="true">
      {Array.from({ length: repeat }, (_, index) => (
        <span key={index} className="flex items-center">
          <span className="display-entity px-8 text-[clamp(2.5rem,7vw,5.5rem)] text-transparent [-webkit-text-stroke:1px_rgb(255_255_255/0.2)]">
            {text}
          </span>
          <span className="size-2 rounded-full bg-[var(--color-accent)]" />
        </span>
      ))}
    </span>
  );

  return (
    <div
      aria-hidden="true"
      className="relative overflow-hidden border-y border-[var(--color-border)] py-4 [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]"
    >
      <div className="animate-marquee flex w-max items-center" style={{ "--marquee-duration": `${duration}s` } as React.CSSProperties}>
        {unit}
        {unit}
      </div>
    </div>
  );
}
