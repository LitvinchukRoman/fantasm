import type { User } from "./api-types";

export const PROFILE_FIELDS = ["name", "handle", "bio", "faculty"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type ProfileUpdate = Partial<Pick<User, ProfileField>>;

/** Заглушка `u_<uuid>`, яку бекенд ставить при першому вході. Людям її не показуємо. */
export function isGeneratedHandle(handle: string): boolean {
  return /^u_[0-9a-f]{32}$/.test(handle);
}

/** Лише змінені поля: PATCH не перезаписує те, чого людина не торкалась. */
export function profileChanges(form: FormData, current: User): ProfileUpdate {
  const update: ProfileUpdate = {};
  for (const field of PROFILE_FIELDS) {
    const value = String(form.get(field) ?? "").trim();
    if (value !== (current[field] ?? "")) update[field] = value;
  }
  return update;
}

// Бекенд відповідає англійськими повідомленнями валідації; тут їхній український зміст.
const HANDLE_ERRORS: Record<string, string> = {
  "is already taken": "Цей нікнейм уже зайнятий.",
  "is reserved": "Цей нікнейм зарезервований.",
};
const FIELD_ERRORS: Record<ProfileField, string> = {
  name: "Імʼя: від 1 до 100 символів, без < і >.",
  handle: "3–30 символів: малі латинські літери, цифри, «_» або «-», на початку літера чи цифра.",
  bio: "Про себе: до 500 символів, без < і >.",
  faculty: "Факультет: до 100 символів, без < і >.",
};

export function profileFieldErrors(fields: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, message] of Object.entries(fields)) {
    out[field] = (field === "handle" && HANDLE_ERRORS[message]) || FIELD_ERRORS[field as ProfileField] || message;
  }
  return out;
}
