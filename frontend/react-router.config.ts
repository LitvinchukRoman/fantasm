import type { Config } from "@react-router/dev/config";
import { getAllDocs } from "./app/lib/content";
import { getIdeas } from "./app/lib/ideas";

export default {
  // Публічні сторінки рендеряться сервером — вимога з FULL_CONTEXT.md
  // ("Висновок по архітектурі", п.2). Лендинг і гайди пререндеряться в HTML.
  // initial: статичний прев’ю-сервер не віддає /__manifest, тож клієнтський
  // перехід на /register інакше падає з 404.
  ssr: true,
  routeDiscovery: { mode: "initial" },
  async prerender() {
    const guides = getAllDocs().map((doc) => doc.path);
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
      ...guides,
      ...ideas,
    ];
  },
} satisfies Config;
