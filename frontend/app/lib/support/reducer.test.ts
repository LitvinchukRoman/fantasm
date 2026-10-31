import { describe, expect, it } from "vitest";
import { chatReducer, initialChat, type ChatState } from "./reducer";
import type { StreamEvent } from "./types";

const at = "2026-10-31T10:00:00Z";
const sent = chatReducer(initialChat, {
  kind: "sent",
  ticketId: "t1",
  message: { id: "m1", author: "customer", visibility: "public", text: "Де моя ідея?", createdAt: at },
});

const play = (state: ChatState, ...events: StreamEvent[]) =>
  events.reduce((acc, event) => chatReducer(acc, { kind: "event", event }), state);

describe("support chat reducer", () => {
  it("shows the current stage while processing and clears it when the bot is done", () => {
    const mid = play(sent, { seq: 1, ticketId: "t1", type: "trace", step: { stage: "investigate", summary: "Перевіряю ідею", at } });
    expect(mid.stage).toBe("investigate");
    const done = play(mid, { seq: 2, ticketId: "t1", type: "status", status: "awaiting_customer", autonomy: "auto" });
    expect(done.stage).toBeNull();
    expect(done.autonomy).toBe("auto");
  });

  it("ignores replayed events after a reconnect", () => {
    const reply: StreamEvent = {
      seq: 3,
      ticketId: "t1",
      type: "message",
      message: { id: "m2", author: "bot", visibility: "public", text: "Ідея на премодерації", createdAt: at },
    };
    const once = play(sent, reply);
    expect(play(once, reply)).toBe(once);
    expect(once.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("drops events of another ticket", () => {
    expect(play(sent, { seq: 9, ticketId: "t2", type: "status", status: "solved" })).toBe(sent);
  });

  it("does not let a stale snapshot roll the chat back", () => {
    const ahead = play(sent, { seq: 5, ticketId: "t1", type: "status", status: "escalated" });
    const stale = chatReducer(ahead, { kind: "snapshot", snapshot: { id: "t1", status: "processing", messages: [], trace: [], lastSeq: 2 } });
    expect(stale).toBe(ahead);
  });

  it("keeps a just-sent message that the snapshot does not know yet", () => {
    const state = chatReducer(sent, { kind: "snapshot", snapshot: { id: "t1", status: "processing", messages: [], trace: [], lastSeq: 0 } });
    expect(state.messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("replaces the customer's own text with the redacted copy from the server", () => {
    const state = play(sent, {
      seq: 1,
      ticketId: "t1",
      type: "message",
      message: { id: "m1", author: "customer", visibility: "public", text: "Мій номер [PHONE]", createdAt: at },
    });
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0].text).toBe("Мій номер [PHONE]");
  });

  it("goes from awaiting approval to solved when a moderator answers", () => {
    const waiting = play(sent, { seq: 1, ticketId: "t1", type: "status", status: "awaiting_approval", autonomy: "approve" });
    const solved = play(
      waiting,
      { seq: 2, ticketId: "t1", type: "message", message: { id: "m3", author: "agent", visibility: "public", text: "Відновили", createdAt: at } },
      { seq: 3, ticketId: "t1", type: "status", status: "solved" },
    );
    expect(solved.status).toBe("solved");
    expect(solved.autonomy).toBe("approve");
    expect(solved.messages.at(-1)?.author).toBe("agent");
  });

  it("starts over on reset", () => {
    expect(chatReducer(sent, { kind: "reset" })).toBe(initialChat);
  });
});
