/**
 * Контракт чату підтримки з бекендом (`/api/support`, camelCase).
 * Джерело правди: CONTEXT.md §6 команди. Змінюється лише разом із бекендом.
 */

/** Кроки pipeline бекенду. Порядок = порядок у таймлайні. */
export const STAGES = [
  "received",
  "prefilter",
  "classify",
  "context",
  "investigate",
  "decide",
  "render",
  "validate",
  "route",
  "execute",
  "error",
] as const;
export type SupportStage = (typeof STAGES)[number];

export type Autonomy = "auto" | "approve" | "escalate";

export type TicketStatus = "processing" | "awaiting_customer" | "awaiting_approval" | "escalated" | "solved";

export type MessageAuthor = "customer" | "bot" | "agent";

/** Лише внутрішні шляхи сайту: бекенд не може підсунути зовнішнє посилання. */
export interface SuggestedAction {
  label: string;
  to: string;
}

/** Файл до звернення (скріншот, PDF). Завантажується окремо, повідомлення посилається на id. */
export interface Attachment {
  id: string;
  name: string;
  size: number;
  contentType: string;
  /** Звідки показати: внутрішній шлях API або `blob:` для щойно доданого файлу. */
  url?: string;
}

export interface SupportMessage {
  id: string;
  author: MessageAuthor;
  /** internal бачить лише персонал; клієнтський API таких не віддає взагалі. */
  visibility: "public" | "internal";
  text: string;
  actions?: SuggestedAction[];
  attachments?: Attachment[];
  createdAt: string;
}

export interface TraceStep {
  stage: SupportStage;
  /** Одне речення українською, безпечне для показу клієнту. */
  summary: string;
  durationMs?: number;
  /** Сирі дані кроку (Classification, Decision…). Лише в staff-відповідях. */
  data?: Record<string, unknown>;
  at: string;
}

interface EventBase {
  /** Монотонний номер події в межах тікета. Він же `id:` у SSE для Last-Event-ID. */
  seq: number;
  ticketId: string;
}

export type StreamEvent =
  | (EventBase & { type: "trace"; step: TraceStep })
  | (EventBase & { type: "message"; message: SupportMessage })
  | (EventBase & { type: "status"; status: TicketStatus; autonomy?: Autonomy; reason?: string });

export interface TicketSnapshot {
  id: string;
  status: TicketStatus;
  autonomy?: Autonomy;
  messages: SupportMessage[];
  trace: TraceStep[];
  /** seq останньої події, яка вже врахована в цьому знімку. */
  lastSeq: number;
}

export interface SendInput {
  ticketId: string | null;
  /** Може бути порожнім, якщо є вкладення: людина просто надіслала скріншот. */
  text: string;
  /** id з `upload()`; бекенд перевіряє, що файли завантажив цей самий власник. */
  attachmentIds?: string[];
  /** Лише для аноніма: куди відповісти, якщо закриє вкладку. */
  email?: string;
  /** Сторінка, з якої написали. Підказка для бекенду, не доказ. */
  page: string;
  ideaSlug?: string;
}

export interface SendResult {
  ticketId: string;
  messageId: string;
}

/** Формат помилки fantasm API. */
export interface SupportApiError {
  error: string;
  code: string;
  fields?: Record<string, string>;
}

export interface StreamHandlers {
  onEvent: (event: StreamEvent) => void;
  onSnapshot: (snapshot: TicketSnapshot) => void;
}

/** Транспорт чату: справжній (fetch + SSE) або mock для демо без бекенду. */
export interface SupportTransport {
  /**
   * `identity` — токен з `/api/me/support-token` (заголовок `X-Fantasm-Identity`). З ним бот може
   * подивитися й змінити підписки саме цієї людини; без нього лише відповідає.
   */
  send(input: SendInput, identity?: string | null): Promise<SendResult>;
  getTicket(ticketId: string): Promise<TicketSnapshot>;
  /** Підписка на події тікета. Повертає відписку. */
  subscribe(ticketId: string, handlers: StreamHandlers): () => void;
  feedback(messageId: string, helpful: boolean): Promise<void>;
  /** Завантажує файл до надсилання повідомлення. `signal` скасовує, якщо людина прибрала файл. */
  upload(file: File, signal?: AbortSignal): Promise<Attachment>;
}
