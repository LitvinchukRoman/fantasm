import type { IconProps } from "~/components/landing/icons";

/** Гліфи чату підтримки в тому самому стилі, що й landing/icons: stroke 1.5, viewBox 20. */
const base = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Хмаринка чату з двома рядками: знак підтримки (кнопка, шапка, аватар бота). */
export const CHAT_PATH =
  "M5 4h10a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H9.5L6 17.25V14.5H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM6.75 8h6.5M6.75 11h4";

export function IconChat({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d={CHAT_PATH} />
    </svg>
  );
}

export function IconExpand({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M11.5 3.5h5v5M8.5 16.5h-5v-5M16.5 3.5l-5.5 5.5M3.5 16.5 9 11" />
    </svg>
  );
}

export function IconCollapse({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M16 9h-5V4M4 11h5v5M11 9l5.5-5.5M9 11l-5.5 5.5" />
    </svg>
  );
}

export function IconPaperclip({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="m15.5 9.5-5.6 5.6a3.5 3.5 0 0 1-5-5l6-6a2.3 2.3 0 0 1 3.3 3.3l-6 6a1.2 1.2 0 0 1-1.7-1.7l5.5-5.5" />
    </svg>
  );
}

export function IconFile({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <path d="M11.5 2.5H6A1.5 1.5 0 0 0 4.5 4v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5l-4-4Z" />
      <path d="M11.5 2.5v4h4" />
    </svg>
  );
}
