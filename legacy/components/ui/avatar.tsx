import { cn } from "@/lib/utils";

const SIZES = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-16 text-lg" };

/** Avatar image with a gradient initials fallback. */
export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <span
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white",
        "bg-gradient-to-br from-[var(--color-aurora-indigo)] via-[var(--color-aurora-violet)] to-[var(--color-aurora-teal)]",
        SIZES[size],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
