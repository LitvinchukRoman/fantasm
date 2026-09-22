import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const CATEGORY_LABELS: Record<string, string> = {
  STARTUP: "Стартап",
  PROJECT: "Проєкт",
  EVENT: "Подія",
  COMMUNITY: "Спільнота",
  OTHER: "Інше",
};

export const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Чернетка",
  OPEN: "Відкрито",
  TEAM_FORMING: "Збір команди",
  IN_PROGRESS: "У роботі",
  DONE: "Завершено",
  ARCHIVED: "Архів",
};

export const SORT_LABELS: Record<string, string> = {
  HOT: "Гарячі",
  NEW: "Нові",
  TOP: "Топ",
};
