import type { Autonomy, StreamEvent, SupportMessage, SupportStage, TicketSnapshot, TicketStatus, TraceStep } from "./types";

export interface ChatState {
  ticketId: string | null;
  status: TicketStatus | "idle";
  autonomy?: Autonomy;
  messages: SupportMessage[];
  trace: TraceStep[];
  lastSeq: number;
  /** Крок, який бекенд зараз виконує: з нього індикатор «Перевіряю…». */
  stage: SupportStage | null;
}

export type ChatAction =
  | { kind: "snapshot"; snapshot: TicketSnapshot }
  | { kind: "event"; event: StreamEvent }
  | { kind: "sent"; ticketId: string; message: SupportMessage }
  | { kind: "reset" };

export const initialChat: ChatState = {
  ticketId: null,
  status: "idle",
  messages: [],
  trace: [],
  lastSeq: 0,
  stage: null,
};

function upsertMessage(list: SupportMessage[], message: SupportMessage): SupportMessage[] {
  const index = list.findIndex((item) => item.id === message.id);
  if (index === -1) return [...list, message];
  const next = list.slice();
  next[index] = message;
  return next;
}

/** Статуси, у яких бот уже закінчив і нічого не перевіряє. */
const DONE: ReadonlySet<ChatState["status"]> = new Set(["awaiting_customer", "awaiting_approval", "escalated", "solved"]);

export function isDone(status: ChatState["status"]): boolean {
  return DONE.has(status);
}

/**
 * Чиста функція: знімок + події SSE → стан чату.
 * Події з seq ≤ lastSeq ігноруються, тож повтор після перепідключення нічого не дублює.
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.kind) {
    case "reset":
      return initialChat;
    case "snapshot": {
      const { snapshot } = action;
      if (state.ticketId === snapshot.id && snapshot.lastSeq < state.lastSeq) return state;
      // Знімок може ще не знати про щойно надіслане повідомлення: не губимо його з екрана.
      const known = new Set(snapshot.messages.map((message) => message.id));
      const pending = state.ticketId === snapshot.id ? state.messages.filter((message) => !known.has(message.id)) : [];
      return {
        ticketId: snapshot.id,
        status: snapshot.status,
        autonomy: snapshot.autonomy,
        messages: [...snapshot.messages, ...pending],
        trace: snapshot.trace,
        lastSeq: snapshot.lastSeq,
        stage: isDone(snapshot.status) ? null : (snapshot.trace.at(-1)?.stage ?? null),
      };
    }
    case "sent":
      return {
        ...state,
        ticketId: action.ticketId,
        status: "processing",
        stage: "received",
        messages: upsertMessage(state.messages, action.message),
      };
    case "event": {
      const { event } = action;
      if (event.ticketId !== state.ticketId || event.seq <= state.lastSeq) return state;
      const base = { ...state, lastSeq: event.seq };
      if (event.type === "trace") return { ...base, trace: [...state.trace, event.step], stage: event.step.stage };
      if (event.type === "message") return { ...base, messages: upsertMessage(state.messages, event.message) };
      return {
        ...base,
        status: event.status,
        autonomy: event.autonomy ?? state.autonomy,
        stage: isDone(event.status) ? null : state.stage,
      };
    }
  }
}
