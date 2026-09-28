import type { Config } from "@react-router/dev/config";
import { getAllDocs } from "./app/lib/content.server";
import { getIdeas } from "./app/lib/ideas.server";

export default {
  // Публічні сторінки рендеряться сервером — вимога з FULL_CONTEXT.md
  // ("Висновок по архітектурі", п.2). Лендинг і гайди пререндеряться в HTML.
  // initial: статичний прев’ю-сервер не віддає /__manifest, тож клієнтський
  // перехід на /register інакше падає з 404.
  ssr: true,
  routeDiscovery: { mode: "initial" },
  async prerender() {
    const guides = getAllDocs().map((doc) => doc.path);
    // getIdeas() читає той самий IDEAS_SEED, що й лоадери: тестові картки
    // або є і в списку, і в даних, або їх немає ніде.
    const ideas = getIdeas().map((idea) => `/ideas/${idea.slug}`);
    return [
      "/",
      "/guides",
      "/ideas",
      "/ideas/new",
      "/events",
      "/login",
      "/register",
      "/sitemap.xml",
      "/robots.txt",
      ...guides,
      ...ideas,
    ];
  },
} satisfies Config;
