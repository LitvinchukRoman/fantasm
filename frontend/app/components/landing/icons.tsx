/**
 * Мінімальний набір лінійних іконок для лендингу.
 *
 * У проєкті ще не встановлено бібліотеку іконок (Phosphor/Radix/Tabler),
 * а вже наявний public/icons.svg містить лише бренд-логотипи (bluesky,
 * discord, github, x) — не набір для контенту лендингу. Щоб не тягнути
 * нову залежність під шість дрібних гліфів, нижче — прості геометричні
 * знаки в одному стилі (stroke, currentColor, strokeWidth 1.5,
 * viewBox 0 0 20 20), без кліше типу ракети для "стартапу" чи щита для
 * "безпеки" (redesign-existing-projects skill, розділ "Iconography").
 */

export type IconProps = { className?: string };

const base = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function IconArrowRight({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M4 10h12M11 5l5 5-5 5" />
    </svg>
  );
}

export function IconSpark({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M10 2.5v4M10 13.5v4M2.5 10h4M13.5 10h4M5 5l2.5 2.5M12.5 12.5 15 15M15 5l-2.5 2.5M7.5 12.5 5 15" />
    </svg>
  );
}

export function IconPulse({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M2.5 10h3l2-5 3 10 2-5h5" />
    </svg>
  );
}

export function IconUsers({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M7.5 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
      <path d="M2.75 15.5c0-2.3 2.1-4 4.75-4s4.75 1.7 4.75 4" />
      <path d="M12.5 5.35a2.5 2.5 0 0 1 0 4.8M15.25 15.5c0-1.95-1.4-3.5-3.4-3.9" />
    </svg>
  );
}

export function IconSealCheck({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M10 2.5 12.6 4l3-.2.6 3 2.1 2.2-1.4 2.7 1.4 2.7-2.1 2.2-.6 3-3-.2L10 21l-2.6-1.8-3 .2-.6-3-2.1-2.2 1.4-2.7-1.4-2.7 2.1-2.2.6-3 3 .2Z" />
      <path d="M7 10.2 9.2 12.4 13.4 7.8" />
    </svg>
  );
}

export function IconLayers({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M10 3 2.5 7 10 11l7.5-4Z" />
      <path d="M4.5 9.6 2.5 10.6 10 14.6l7.5-4-2-1" />
      <path d="M4.5 12.6 2.5 13.6 10 17.6l7.5-4-2-1" />
    </svg>
  );
}

export function IconCalendar({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="13" rx="2" />
      <path d="M3 8.5h14M6.5 2.5v4M13.5 2.5v4" />
    </svg>
  );
}

export function IconBook({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M10 5.2c-1.2-1-3.1-1.5-6-1.5v11.6c2.9 0 4.8.5 6 1.5 1.2-1 3.1-1.5 6-1.5V3.7c-2.9 0-4.8.5-6 1.5Z" />
      <path d="M10 5.2v11.6" />
    </svg>
  );
}

export function IconHeart({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M10 17c-4-2.6-7-5.4-7-8.7C3 5.8 4.9 4 7.2 4 8.4 4 9.4 4.6 10 5.5 10.6 4.6 11.6 4 12.8 4 15.1 4 17 5.8 17 8.3 17 11.6 14 14.4 10 17Z" />
    </svg>
  );
}

export function IconDots({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M5 10h.01M10 10h.01M15 10h.01" strokeWidth={2.4} />
    </svg>
  );
}

export function IconEyeOff({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 3l14 14" />
      <path d="M9.1 5.1C9.4 5 9.7 5 10 5c4 0 6.7 3 7.6 4.4a1.4 1.4 0 0 1 0 1.4c-.4.6-1.1 1.6-2.1 2.5M6.3 6.3C4.6 7.4 3.4 8.9 2.4 9.9a1.4 1.4 0 0 0 0 1.4C3.3 12.6 6 15.5 10 15.5c1.1 0 2.1-.2 3-.6" />
      <path d="M7.9 8.2A2.6 2.6 0 0 0 7.4 10a2.6 2.6 0 0 0 2.6 2.6c.6 0 1.2-.2 1.6-.6" />
    </svg>
  );
}

export function IconFlame({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M10 2.5c.6 2.4-1 3.6-2 5-1.2 1.7-1.8 3-1.8 4.5a3.8 3.8 0 0 0 7.6 0c0-1.1-.3-1.9-.9-2.8.1 1.1-.3 2-1 2.4.3-2.3-.6-3.4-1.4-4.6-.5-.8-.7-1.7-.5-2.5-1 .5-1.6 1.3-1.9 2.4-.2-1.6.3-3 1.9-4.4Z" />
    </svg>
  );
}

export function IconPenLine({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M3 17h4l9-9-4-4-9 9v4Z" />
      <path d="M11 5l4 4" />
    </svg>
  );
}
