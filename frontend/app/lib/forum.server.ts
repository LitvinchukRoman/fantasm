/**
 * Форум під ідеєю. Поки Go-API немає, живих дописів теж немає: порожня гілка і є чесний стан.
 * Приклади для верстки лежать лише за прапорцем сіда (див. `ideasSeedEnabled`) і не потрапляють у прод.
 * Автори повторюють сідових авторів ідей, щоб профілі (`/u/:handle`) вели на реальні сторінки.
 */
import { countPosts, type ForumPost, type ForumThread } from "./forum";
import type { IdeaAuthor } from "./ideas";
import { renderMarkdown } from "./markdown.server";

const ADMIN: IdeaAuthor = { handle: "naukma-ideas", name: "NaUKMA Ideas", verified: true };
const STUDENT: IdeaAuthor = { handle: "student123", name: "Звичайний Студент", verified: false };
const HACKER: IdeaAuthor = { handle: "hacker_bob", name: "Кібер Боб", verified: false };
const DESIGN: IdeaAuthor = { handle: "design_guru", name: "Марія Дизайн", verified: true };

type Draft = {
  id: string;
  author: IdeaAuthor;
  createdAt: string;
  body: string;
  deleted?: boolean;
  replies?: Draft[];
};

const DRAFTS: Record<string, Draft[]> = {
  "lecturenotes-ai": [
    {
      id: "p1",
      author: DESIGN,
      createdAt: "2026-09-21T09:30:00.000Z",
      body: "Ідея сильна. Для конспекту важливо бачити **таймкоди** навпроти кожної тези, тоді його можна перевірити по запису.\n\nЯ можу накидати структуру інтерфейсу, якщо зберетесь на хакатон.",
      replies: [
        {
          id: "p1-1",
          author: HACKER,
          createdAt: "2026-09-21T11:05:00.000Z",
          body: "Таймкоди є в MVP. Інтерфейсу якраз і бракує: давай зідзвонимось у п'ятницю?",
          replies: [
            {
              id: "p1-1-1",
              author: DESIGN,
              createdAt: "2026-09-21T11:40:00.000Z",
              body: "Так, після пар вільна. Напиши час, я підлаштуюсь.",
            },
          ],
        },
      ],
    },
    {
      id: "p2",
      author: STUDENT,
      createdAt: "2026-09-22T14:10:00.000Z",
      body: "Скільки мов розпізнає? Частина лекцій у нас англійською, а частина мішана.",
      replies: [
        {
          id: "p2-1",
          author: HACKER,
          createdAt: "2026-09-22T15:00:00.000Z",
          body: "Українська та англійська, мішані лекції поки тестуємо. Якщо маєш запис на 10-15 хвилин, скинь, перевіримо.",
        },
      ],
    },
    {
      id: "p3",
      author: STUDENT,
      createdAt: "2026-09-23T08:00:00.000Z",
      body: "",
      deleted: true,
    },
  ],
  "debatnyi-klub": [
    {
      id: "p1",
      author: ADMIN,
      createdAt: "2026-09-10T10:00:00.000Z",
      body: "Підкажіть, в який день вам зручніше: **вівторок** чи **четвер**? Збираємо перший раунд.",
      replies: [
        {
          id: "p1-1",
          author: STUDENT,
          createdAt: "2026-09-10T12:20:00.000Z",
          body: "Четвер. У вівторок у мене пара до шостої.",
        },
      ],
    },
  ],
  // Тестова гілка для верстки: вкладені відповіді (до FORUM_MAX_DEPTH і глибше), довгий текст, список, видалений допис.
  "zrazok-9": [
    {
      id: "p1",
      author: DESIGN,
      createdAt: "2026-10-04T09:15:00.000Z",
      body: "Дуже хочу в команду. Пропоную розділити ролі так:\n\n- **режисер** і сценарій\n- **оператор** і монтаж\n- **звук**, музика й субтитри\n\nПерший фільм на 5-7 хвилин, зняти за місяць. Хто з вас вже щось знімав?",
      replies: [
        {
          id: "p1-1",
          author: HACKER,
          createdAt: "2026-10-04T10:40:00.000Z",
          body: "Знімав два ролики на телефон, монтую в DaVinci. Можу взяти монтаж.",
          replies: [
            {
              id: "p1-1-1",
              author: DESIGN,
              createdAt: "2026-10-04T11:05:00.000Z",
              body: "Супер, тоді оператор потрібен окремо. Є в когось камера, що тримає 4K?",
              replies: [
                {
                  id: "p1-1-1-1",
                  author: STUDENT,
                  createdAt: "2026-10-04T12:30:00.000Z",
                  body: "Є дзеркалка, але без нормального штатива. У бібліотеці можна взяти під розписку?",
                  replies: [
                    {
                      id: "p1-1-1-1-1",
                      author: ADMIN,
                      createdAt: "2026-10-04T13:00:00.000Z",
                      body: "Штатив і мікрофон видають у медіацентрі за студентським. Напишіть нам, домовимось про бронь.",
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          id: "p1-2",
          author: STUDENT,
          createdAt: "2026-10-04T14:20:00.000Z",
          body: "Я б узяв звук. Тільки скажіть дедлайн, щоб я під нього підлаштувався.",
        },
      ],
    },
    {
      id: "p2",
      author: HACKER,
      createdAt: "2026-10-05T08:00:00.000Z",
      body: "Питання по темі: знімаємо про людей чи про місця? Від цього залежить, скільки разів треба виїжджати на локацію і чи потрібні дозволи на зйомку.",
      replies: [
        {
          id: "p2-1",
          author: DESIGN,
          createdAt: "2026-10-05T09:10:00.000Z",
          body: "Про людей кампусу. Місця тоді лише тло, дозволи простіші.",
        },
      ],
    },
    {
      id: "p3",
      author: STUDENT,
      createdAt: "2026-10-05T10:00:00.000Z",
      body: "",
      deleted: true,
    },
    {
      id: "p4",
      author: ADMIN,
      createdAt: "2026-10-06T07:45:00.000Z",
      body: "Збираємось у четвер о 18:00 в читальній залі, принесіть ідеї для сюжету. Якщо не можете, напишіть сюди, і ми врахуємо ваш час.",
    },
  ],
  "mafia-piatnytsi": [
    {
      id: "p1",
      author: STUDENT,
      createdAt: "2026-09-26T18:00:00.000Z",
      body: "Скільки людей потрібно мінімум, щоб почати? Хочу привести друзів з іншого факультету.",
    },
  ],
};

function plain(markdown: string): string {
  return markdown
    .replace(/[#*_>`[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function build(draft: Draft): ForumPost {
  const deleted = draft.deleted === true;
  return {
    id: draft.id,
    author: draft.author,
    createdAt: draft.createdAt,
    html: deleted ? "" : renderMarkdown(draft.body),
    text: deleted ? "" : plain(draft.body),
    deleted,
    replies: (draft.replies ?? []).map(build),
  };
}

function countDrafts(drafts: Draft[]): number {
  return drafts.reduce((sum, draft) => sum + (draft.deleted ? 0 : 1) + countDrafts(draft.replies ?? []), 0);
}

/** Кількість дописів без побудови HTML: для лічильників на стрічці. */
export function forumCount(ideaSlug: string, seed: boolean): number | null {
  const drafts = seed ? DRAFTS[ideaSlug] : undefined;
  return drafts ? countDrafts(drafts) : null;
}

export function getThread(ideaSlug: string, seed: boolean): ForumThread {
  const drafts = seed ? (DRAFTS[ideaSlug] ?? []) : [];
  const posts = drafts.map(build);
  return { id: `${ideaSlug}-main`, ideaSlug, count: countPosts(posts), posts };
}
