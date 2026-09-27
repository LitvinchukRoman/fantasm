import type { Config } from "@react-router/dev/config";
import { getAllDocs } from "./app/lib/content";
import { getIdeas } from "./app/lib/ideas";

export default {
  // Публічні сторінки рендеряться сервером — вимога з FULL_CONTEXT.md
  // ("Висновок по архітектурі", п.2). Лендинг і гайди пререндеряться в HTML.
  ssr: true,
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
      "/sitemap.xml",
      ...guides,
      ...ideas,
    ];
  },
} satisfies Config;
