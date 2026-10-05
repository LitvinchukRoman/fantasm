import { IconSealCheck } from "~/components/landing/icons";

/**
 * Печатка могилянця: єдиний знак верифікації на сайті. Стилі та анімація заливки в `.verified-badge`.
 * `compact` показує лише іконку (поруч з іменем автора), без пігулки.
 */
export function VerifiedSeal({ compact = false, label = "Могилянець" }: { compact?: boolean; label?: string }) {
  if (compact) {
    return (
      <span
        role="img"
        aria-label="Верифікований могилянець"
        title="Верифікований могилянець"
        className="inline-flex align-middle text-[var(--color-accent)]"
      >
        <IconSealCheck className="size-4" />
      </span>
    );
  }
  return (
    <span className="verified-badge">
      <span aria-hidden="true" className="verified-badge-fill" />
      <IconSealCheck className="relative size-4" />
      <span className="relative">{label}</span>
    </span>
  );
}
