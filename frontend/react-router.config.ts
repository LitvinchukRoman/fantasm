import type { Config } from "@react-router/dev/config";
import { getAllDocs } from "./app/lib/content";

export default {
  // Публічні сторінки рендеряться сервером — вимога з FULL_CONTEXT.md
  // ("Висновок по архітектурі", п.2). Лендинг і гайди пререндеряться в HTML.
  ssr: true,
  async prerender() {
    const guides = getAllDocs().map((doc) => doc.path);
    return [
      "/",
      "/guides",
      "/ideas",
      "/ideas/new",
      "/events",
      "/login",
      "/sitemap.xml",
      ...guides,
    ];
  },
} satisfies Config;
