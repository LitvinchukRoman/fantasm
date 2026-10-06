/**
 * Місце в стрічці ідей переживає перехід на ідею й назад (sessionStorage, лише в межах вкладки).
 * `mode`: вигнута стрічка тримає внутрішній зсув, плоска (мобайл) тримає scrollY документа.
 * `signature`: склад списку (фільтри, сортування); коли він інший, старе місце не стосується нового списку.
 */
type Mode = "curved" | "flat";

const key = (mode: Mode) => `fantasm:feed-position:${mode}`;

export function saveFeedPosition(mode: Mode, signature: string, value: number): void {
  try {
    sessionStorage.setItem(key(mode), JSON.stringify({ signature, value }));
  } catch {
    // Приватний режим або повне сховище: просто не запам'ятовуємо.
  }
}

export function readFeedPosition(mode: Mode, signature: string): number | null {
  try {
    const raw = sessionStorage.getItem(key(mode));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { signature?: string; value?: unknown };
    return saved.signature === signature && typeof saved.value === "number" && Number.isFinite(saved.value) ? saved.value : null;
  } catch {
    return null;
  }
}
