import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Deterministic hash → makes each idea's cover stable across renders. */
function hash(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic idea cover — a two-tone gradient + tiny constellation derived
 * from the idea id/slug, kept inside the brand hue family so the feed looks
 * rich without any uploaded images. No two random rainbow blocks.
 */
export function Cover({
  seed,
  className,
  children,
}: {
  seed: string;
  className?: string;
  children?: ReactNode;
}) {
  const h = hash(seed);
  const hue = 55 + (h % 60); // 55–115: amber → gold → warm green, one family
  const angle = 100 + ((h >> 3) % 80);
  const chroma = 0.11 + ((h >> 6) % 6) / 100;
  const from = `oklch(0.42 ${chroma} ${hue})`;
  const to = `oklch(0.66 ${chroma + 0.03} ${(hue + 24) % 360})`;

  // three deterministic "stars"
  const stars = [0, 1, 2].map((i) => ({
    x: 12 + ((h >> (i * 4)) % 76),
    y: 18 + ((h >> (i * 4 + 2)) % 64),
    r: 1.5 + ((h >> (i * 3)) % 3),
  }));

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})` }}
      aria-hidden
    >
      <svg className="absolute inset-0 size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1={stars[0].x} y1={stars[0].y} x2={stars[1].x} y2={stars[1].y} stroke="white" strokeOpacity="0.35" strokeWidth="0.4" />
        <line x1={stars[1].x} y1={stars[1].y} x2={stars[2].x} y2={stars[2].y} stroke="white" strokeOpacity="0.25" strokeWidth="0.4" />
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="white" fillOpacity={0.55 - i * 0.12} />
        ))}
      </svg>
      {/* soft top light + grain to match the rest of the surface language */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_-10%,rgba(255,255,255,0.28),transparent_55%)]" />
      {children}
    </div>
  );
}
