import { formatDistanceToNow, format } from "date-fns";
import { uk } from "date-fns/locale";

/** "3 години тому" style relative time in Ukrainian. */
export function timeAgo(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: uk });
  } catch {
    return "";
  }
}

/** "8 вересня, 18:00" style absolute event time. */
export function eventDate(iso: string): string {
  try {
    return format(new Date(iso), "d MMMM, HH:mm", { locale: uk });
  } catch {
    return "";
  }
}

/** Simple Ukrainian pluralization (1 ідея / 2 ідеї / 5 ідей). */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} ${few}`;
  return `${n} ${many}`;
}
