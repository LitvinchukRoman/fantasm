import type { Attachment } from "./types";

/** Що приймаємо: скріншоти й фото, PDF, текстові логи. Однакові межі мусять бути й на бекенді. */
export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf", "text/plain"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_TYPES.join(",");
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface FileCheck {
  accepted: File[];
  /** Людські причини, чому частину файлів не взяли. */
  rejected: string[];
}

/**
 * Відбирає файли, які можна додати до вже вибраних: тип, розмір, кількість.
 * Чиста функція, щоб однаково працювати для кнопки, вставки з буфера й перетягування.
 */
export function checkFiles(incoming: readonly File[], alreadySelected: number): FileCheck {
  const accepted: File[] = [];
  const rejected: string[] = [];
  for (const file of incoming) {
    if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
      rejected.push(`«${file.name}»: такий тип файлу не підтримується. Підійдуть зображення, PDF або текст.`);
    } else if (file.size > MAX_FILE_BYTES) {
      rejected.push(`«${file.name}»: більше за ${formatSize(MAX_FILE_BYTES)}.`);
    } else if (alreadySelected + accepted.length >= MAX_FILES) {
      rejected.push(`Можна додати щонайбільше ${MAX_FILES} файлів.`);
      break;
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

export function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

/** Показуємо лише свої адреси: внутрішній шлях або blob щойно доданого файлу. */
export function safePreviewUrl(attachment: Pick<Attachment, "url">): string | undefined {
  const { url } = attachment;
  if (!url) return undefined;
  if (url.startsWith("blob:")) return url;
  return url.startsWith("/") && !url.startsWith("//") ? url : undefined;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",")} МБ`;
}

/** Вставлений із буфера скріншот приходить як `image.png`: даємо зрозуміле імʼя. */
export function namePasted(file: File, index: number): File {
  if (file.name && file.name !== "image.png") return file;
  const extension = file.type.split("/")[1] ?? "png";
  return new File([file], `Скріншот ${index + 1}.${extension}`, { type: file.type, lastModified: file.lastModified });
}
