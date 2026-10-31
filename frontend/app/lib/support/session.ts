/**
 * Номер відкритого звернення живе в sessionStorage, щоб чат пережив перехід між сторінками.
 * Це не доступ: тікет до браузера привʼязує httpOnly cookie бекенду, а чужий номер дасть 404.
 */
const KEY = "fantasm.support.ticket";

export function readTicketId(): string | null {
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveTicketId(ticketId: string | null) {
  try {
    if (ticketId) window.sessionStorage.setItem(KEY, ticketId);
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // приватний режим або заблоковане сховище: чат просто почнеться заново
  }
}
