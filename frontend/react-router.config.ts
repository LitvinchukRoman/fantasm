import type { Config } from "@react-router/dev/config";

export default {
  // Публічні сторінки рендеряться сервером — вимога з FULL_CONTEXT.md
  // ("Висновок по архітектурі", п.2), не оптимізація: чистий SPA віддає
  // порожній div, а стрічка/ідея/форум мають бути видимі пошуку.
  // Лендинг додатково пререндериться у статичний HTML на білді (SSG).
  ssr: true,
  async prerender() {
    return ["/"];
  },
} satisfies Config;
