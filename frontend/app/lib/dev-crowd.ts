import type { Participant } from "./api-types";
import type { AuthorPreview } from "./users.server";

/** Демо-ідея з сіда, на якій на деві видно зібрану команду. */
export const DEV_CROWD_SLUG = "lecturenotes-ai";

type CrowdPerson = Participant & { preview: AuthorPreview };

/**
 * Умовні портрети в тому ж малюнку, що на головній.
 * Це не фото людей і не акаунти: лише вигляд списку учасників.
 */
const CROWD: CrowdPerson[] = [
  person("olya-koval", "Оля Коваль", "ML", "/mock-avatars/olya.svg", "Роблю моделі, які вміщаються в конспект.", 18),
  person("marko-shevchenko", "Марко Шевченко", "Backend", "/mock-avatars/marko.svg", "Тримаю API, щоб конспект не губився дорогою.", 24),
  person("sofia-levchenko", "Софія Левченко", "Design", "/mock-avatars/sofia.svg", "Збираю екран, який хочеться читати.", 31),
  person("andrii-melnyk", "Андрій Мельник", "Product", "/mock-avatars/andrii.svg", "Слідкую, щоб перша версія лишалась маленькою.", 9),
  person("katia-bondar", "Катерина Бондар", "ML", "/mock-avatars/katia.svg", "Перевіряю, чи конспект ще схожий на лекцію.", 15),
  person("nazar-hrytsenko", "Назар Гриценко", "Backend", "/mock-avatars/nazar.svg", "Зводжу шматки конспекту в одне ціле.", 12),
  person("liza-romaniuk", "Ліза Романюк", "Design", "/mock-avatars/liza.svg", "Роблю, щоб сторінку хотілось гортати.", 21),
  person("taras-bondarenko", "Тарас Бондаренко", "Product", "/mock-avatars/taras.svg", "Питаю, чи це ще конспект, а не підручник.", 7),
  person("yulia-petrenko", "Юля Петренко", "ML", "/mock-avatars/yulia.svg", "Вчу модель чути терміни, а не шум.", 16),
  person("ostap-demchuk", "Остап Демчук", "Backend", "/mock-avatars/ostap.svg", "Слідкую, щоб запис лекції не губився.", 11),
];

function person(handle: string, name: string, role: string, avatarUrl: string, bio: string, karma: number): CrowdPerson {
  return {
    handle,
    name,
    state: "ACCEPTED",
    role,
    preview: {
      handle,
      name,
      bio,
      avatarUrl,
      verified: false,
      karma,
      joinedAt: "2026-09-12T10:00:00.000Z",
      ideasCount: 0,
      ideas: [],
    },
  };
}

/** Локальний Vite і зібраний фронтенд на fantasm-dev. Прод (ideas.naukma.com) сюди не потрапляє. */
export function devCrowdHost(request: Request): boolean {
  if (import.meta.env.DEV) return true;
  return new URL(request.url).hostname === "fantasm-dev.naukma.com";
}

/** Десятеро на порожній демо-ідеї. Якщо там уже є живі заявки, мок не підміняє їх. */
export function devCrowd(request: Request, slug: string, existing: number): { participants: Participant[]; profiles: Record<string, AuthorPreview> } | null {
  if (!devCrowdHost(request) || slug !== DEV_CROWD_SLUG || existing > 0) return null;
  const profiles: Record<string, AuthorPreview> = {};
  const participants = CROWD.map(({ preview, ...participant }) => {
    profiles[participant.handle] = preview;
    return participant;
  });
  return { participants, profiles };
}
