/**
 * Фото людини або перша літера імені в колі. Імʼя завжди стоїть поруч текстом,
 * тож для читачів екрана це декорація. У шапці сайту його не показуємо: там абстрактна іконка.
 */
export function UserAvatar({ name, src, className }: { name: string; src?: string; className: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className={`${className} block shrink-0 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface)] object-cover`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`${className} grid shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-text)]`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
