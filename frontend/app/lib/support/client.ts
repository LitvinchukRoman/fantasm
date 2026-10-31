import type {
  Attachment,
  SendInput,
  SendResult,
  StreamEvent,
  StreamHandlers,
  SupportApiError,
  SupportTransport,
  TicketSnapshot,
} from "./types";

/**
 * База API підтримки. За замовчуванням той самий origin, що й сайт: тоді працюють cookie сесії
 * й аноніма, а CSP `connect-src 'self'` уже покриває і fetch, і SSE.
 */
export const SUPPORT_API = import.meta.env.VITE_SUPPORT_API || "/api/support";

const FALLBACK_ERROR: SupportApiError = { error: "Не вдалося звʼязатися з підтримкою", code: "internal_error" };

async function json<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  let body: SupportApiError = { ...FALLBACK_ERROR, code: response.status === 429 ? "rate_limited" : FALLBACK_ERROR.code };
  try {
    body = { ...body, ...(await response.json()) };
  } catch {
    // тіло не JSON: лишаємо загальну помилку
  }
  throw body;
}

/** Мережа впала до відповіді (офлайн, CORS, обрив): той самий формат, що й помилка API. */
async function request(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { credentials: "same-origin", ...init });
  } catch (cause) {
    if (init.signal?.aborted) throw cause;
    throw { ...FALLBACK_ERROR, code: "network_error" } satisfies SupportApiError;
  }
}

const ticketPath = (ticketId: string) => `${SUPPORT_API}/tickets/${encodeURIComponent(ticketId)}`;

const EVENT_TYPES = ["trace", "message", "status"] as const;

/**
 * SSE з автоматичним перепідключенням (браузер сам шле Last-Event-ID). Якщо стрім так і не
 * відкрився кілька разів поспіль (проксі, корпоративна мережа), переходимо на опитування знімка.
 * Після першого успішного відкриття обриви обробляє сам EventSource.
 */
export function subscribeHttp(
  ticketId: string,
  handlers: StreamHandlers,
  options: { pollMs?: number; maxFailures?: number } = {},
): () => void {
  const { pollMs = 2500, maxFailures = 3 } = options;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failures = 0;
  let opened = false;

  const poll = async () => {
    if (closed) return;
    try {
      handlers.onSnapshot(await http.getTicket(ticketId));
    } catch {
      // наступна спроба за pollMs
    }
    if (!closed) timer = setTimeout(poll, pollMs);
  };

  if (typeof EventSource === "undefined") {
    void poll();
    return () => {
      closed = true;
      clearTimeout(timer);
    };
  }

  const source = new EventSource(`${ticketPath(ticketId)}/events`);
  const onMessage = (raw: MessageEvent<string>) => {
    try {
      handlers.onEvent(JSON.parse(raw.data) as StreamEvent);
    } catch {
      // битий кадр пропускаємо: наступний знімок або подія все одно вирівняють стан
    }
  };
  for (const type of EVENT_TYPES) source.addEventListener(type, onMessage);
  source.onopen = () => {
    opened = true;
    failures = 0;
  };
  source.onerror = () => {
    if (opened) return;
    failures += 1;
    if (failures >= maxFailures) {
      source.close();
      void poll();
    }
  };

  return () => {
    closed = true;
    clearTimeout(timer);
    source.close();
  };
}

const JSON_HEADERS = { "content-type": "application/json", accept: "application/json" };

export const http: SupportTransport = {
  async send(input: SendInput) {
    const response = await request(`${SUPPORT_API}/messages`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
    return json<SendResult>(response);
  },
  async getTicket(ticketId: string) {
    const response = await request(ticketPath(ticketId), { headers: { accept: "application/json" } });
    return json<TicketSnapshot>(response);
  },
  subscribe: (ticketId, handlers) => subscribeHttp(ticketId, handlers),
  async feedback(messageId: string, helpful: boolean) {
    const response = await request(`${SUPPORT_API}/messages/${encodeURIComponent(messageId)}/feedback`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ helpful }),
    });
    if (!response.ok) await json(response);
  },
  async upload(file: File, signal?: AbortSignal) {
    // multipart без ручного content-type: браузер сам поставить boundary.
    const body = new FormData();
    body.append("file", file, file.name);
    const response = await request(`${SUPPORT_API}/attachments`, {
      method: "POST",
      headers: { accept: "application/json" },
      body,
      signal,
    });
    return json<Attachment>(response);
  },
};

let transport: Promise<SupportTransport> | undefined;

/**
 * Транспорт чату. З `VITE_SUPPORT_MOCK=true` це сценарії демо без бекенду; mock підвантажується
 * динамічно, тож у звичайний бандл не потрапляє.
 */
export function getTransport(): Promise<SupportTransport> {
  transport ??=
    import.meta.env.VITE_SUPPORT_MOCK === "true"
      ? import("./mock").then((module) => module.mockTransport)
      : Promise.resolve(http);
  return transport;
}

export function errorText(cause: unknown): string {
  const code = (cause as Partial<SupportApiError> | undefined)?.code;
  if (code === "rate_limited") return "Забагато повідомлень поспіль. Спробуй за хвилину.";
  if (code === "validation_failed") return "Повідомлення не пройшло перевірку. Скороти його або перефразуй.";
  if (code === "network_error") return "Немає звʼязку. Перевір інтернет і спробуй ще раз.";
  if (code === "payload_too_large") return "Файл завеликий для завантаження.";
  return "Не вдалося надіслати. Спробуй ще раз.";
}
