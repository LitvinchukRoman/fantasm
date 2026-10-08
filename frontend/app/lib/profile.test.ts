import { describe, expect, it } from "vitest";
import type { User } from "./api-types";
import { profileChanges, profileFieldErrors } from "./profile";

const user: User = {
  id: "1",
  handle: "u_4aebc32e53054bf490d34e06984e68bd",
  name: "Роман",
  email: "r@example.com",
  bio: "",
  role: "USER",
  createdAt: "2026-10-08T21:03:09Z",
};

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe("profile settings", () => {
  it("sends only changed, trimmed fields", () => {
    expect(profileChanges(form({ name: " Роман ", handle: "roman", bio: "", faculty: " ФІ " }), user)).toEqual({
      handle: "roman",
      faculty: "ФІ",
    });
    expect(profileChanges(form({ name: "Роман", handle: user.handle, bio: "", faculty: "" }), user)).toEqual({});
  });

  it("translates backend validation messages", () => {
    expect(profileFieldErrors({ handle: "is already taken", name: "must be 1-100 characters", other: "x" })).toEqual({
      handle: "Цей нікнейм уже зайнятий.",
      name: "Імʼя: від 1 до 100 символів, без < і >.",
      other: "x",
    });
    expect(profileFieldErrors(undefined)).toEqual({});
  });
});
