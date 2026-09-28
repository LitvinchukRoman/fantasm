import { formatShortDate, timeAgo } from "~/lib/ideas";
import { useHydrated } from "~/lib/use-hydrated";

/**
 * У статичному HTML — абсолютна дата: «3 дні тому», зібране на білді,
 * через тиждень було б неправдою і для людини, і для пошуку.
 * Відносний час підставляється в браузері після гідрації.
 */
export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const hydrated = useHydrated();
  return (
    <time className={className} dateTime={iso} title={formatShortDate(iso)}>
      {hydrated ? timeAgo(iso) : formatShortDate(iso)}
    </time>
  );
}
