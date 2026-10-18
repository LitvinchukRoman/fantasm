import { describe, expect, it } from "vitest";
import { describeNotification } from "./notifications";

const sentence = (n: ReturnType<typeof describeNotification>) => `${n.before}${n.title ? `«${n.title}»` : ""}${n.after}`;

describe("describeNotification", () => {
  it("names the moderation outcome and carries the moderator's note", () => {
    const rejected = describeNotification({ type: "HIDDEN", payload: { ideaTitle: "Тест", decision: "REJECTED", note: "Погана ідея" } });
    expect(sentence(rejected)).toBe("Вашу ідею «Тест» відхилено.");
    expect(rejected.note).toBe("Погана ідея");

    expect(sentence(describeNotification({ type: "APPROVED", payload: { ideaTitle: "Тест" } }))).toBe("Вашу ідею «Тест» схвалено й опубліковано.");
    expect(sentence(describeNotification({ type: "HIDDEN", payload: { ideaTitle: "Тест", decision: "HIDDEN" } }))).toBe("Модератор сховав вашу ідею «Тест».");
    expect(sentence(describeNotification({ type: "HIDDEN", payload: { ideaTitle: "Тест", automatic: true } }))).toContain("через скарги");
  });

  it("says who acted on the idea", () => {
    expect(sentence(describeNotification({ type: "VOTE", payload: { ideaTitle: "Тест", actorName: "Олена" } }))).toBe("Олена підтримує вашу ідею «Тест».");
    expect(sentence(describeNotification({ type: "COMMENT", payload: { ideaTitle: "Тест", actorHandle: "olena" } }))).toBe("olena коментує ідею «Тест».");
  });

  it("never renders an empty or raw-type line", () => {
    expect(sentence(describeNotification({ type: "SYSTEM" }))).toBe("Сповіщення від Fantasm");
  });
});
