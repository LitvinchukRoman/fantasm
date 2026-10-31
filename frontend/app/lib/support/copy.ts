import type { SupportStage, TicketStatus } from "./types";

/**
 * Людські підписи кроків для клієнта. Службові кроки (prefilter, route, error) не підписуємо:
 * вони або миттєві, або закінчуються статусом, який має власний текст.
 */
export const STAGE_LABEL: Partial<Record<SupportStage, string>> = {
  received: "Отримав повідомлення",
  classify: "Розбираюсь, про що питання",
  context: "Дивлюсь твій акаунт",
  investigate: "Перевіряю, що сталося",
  decide: "Вирішую, що робити",
  render: "Пишу відповідь",
  validate: "Пишу відповідь",
  execute: "Виконую",
};

/** Кроки, які не мають підпису для клієнта. */
export const SILENT_STAGES: readonly SupportStage[] = ["prefilter", "route", "error"];

/** Підсумок під розмовою, коли бот закінчив, а відповідь ще може прийти від людини. */
export const STATUS_NOTE: Partial<Record<TicketStatus, string>> = {
  awaiting_approval: "Передав модератору. Відповідь прийде сюди й у сповіщення.",
  escalated: "Передав людині з команди. Відповідь прийде сюди й у сповіщення.",
  solved: "Питання закрито. Якщо щось ще, пиши сюди.",
};

export const DISCLOSURE = "Відповідає ШІ-асистент, складні питання передає людям. Не надсилай паролі й платіжні дані.";

export interface Prompt {
  topic: string;
  text: string;
}

/** Приклади в порожньому чаті. Перші три видно завжди; тема з посилання ставить свій приклад першим. */
export const PROMPTS: readonly Prompt[] = [
  { topic: "idea", text: "Чому моєї ідеї немає в стрічці?" },
  { topic: "seal", text: "Як отримати печатку могилянця?" },
  { topic: "team", text: "Як знайти команду для проєкту?" },
  { topic: "login", text: "Не можу увійти через Microsoft" },
  { topic: "push", text: "Не приходять сповіщення на телефон" },
];

export function promptsFor(topic: string | null | undefined, limit = 3): Prompt[] {
  const first = PROMPTS.find((prompt) => prompt.topic === topic);
  const rest = PROMPTS.filter((prompt) => prompt !== first);
  return (first ? [first, ...rest] : rest).slice(0, limit);
}

/** Бекенд замінює персональні дані плейсхолдерами ще до збереження. */
const REDACTED = /\[(?:EMAIL|PHONE|CARD|IBAN)\]/;

export function wasRedacted(text: string): boolean {
  return REDACTED.test(text);
}

/** Шлях усередині сайту: `/ideas/x` так, `//evil.com`, `https://…`, `javascript:` ні. */
export function isInternalPath(to: string): boolean {
  return to.startsWith("/") && !to.startsWith("//") && !to.startsWith("/\\");
}

export const MAX_MESSAGE = 2000;
