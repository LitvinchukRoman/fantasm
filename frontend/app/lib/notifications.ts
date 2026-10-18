import type { Notification } from "~/lib/api-types";

/** Текст сповіщення довкола назви ідеї: назву сторінка показує посиланням. */
export interface NotificationText {
  before: string;
  title: string | null;
  after: string;
  note?: string;
}

function text(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value.trim() : "";
}

export function describeNotification(item: Pick<Notification, "type" | "payload">): NotificationText {
  const payload = item.payload ?? {};
  const title = text(payload, "ideaTitle") || null;
  const actor = text(payload, "actorName") || text(payload, "actorHandle") || "Хтось";
  const note = text(payload, "note") || undefined;
  const about = (before: string, after = "") => ({ before, title, after, note });

  switch (item.type) {
    case "APPROVED":
      return about("Вашу ідею ", " схвалено й опубліковано.");
    case "HIDDEN":
      if (payload.automatic === true) return about("Вашу ідею ", " тимчасово сховано через скарги. Її перевірить модератор.");
      if (payload.decision === "REJECTED") return about("Вашу ідею ", " відхилено.");
      return about("Модератор сховав вашу ідею ", ".");
    case "COMMENT":
      return about(`${actor} коментує ідею `, ".");
    case "VOTE":
      return about(`${actor} підтримує вашу ідею `, ".");
    case "JOIN":
      return about(`${actor} хоче долучитися до ідеї `, ".");
    case "ACCEPTED":
      return about("Вас прийнято до команди ідеї ", ".");
    case "EVENT_REMINDER":
      return about("Нагадування про подію ", ".");
    default:
      return title ? about("", "") : { before: text(payload, "message") || "Сповіщення від Fantasm", title: null, after: "" };
  }
}
