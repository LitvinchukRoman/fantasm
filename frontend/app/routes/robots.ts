import { absoluteUrl } from "~/lib/seo";

/**
 * /login, /register і заглушки не закриті тут навмисно: Disallow забороняє
 * краулеру відкрити сторінку, і він не побачить її `noindex`, тож URL може
 * потрапити в індекс «без опису». Їх виключає robots-мета на самих сторінках.
 * `.data` — дані клієнтських переходів React Router, для індексу вони шум.
 */
export function loader() {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /*.data$",
    "Disallow: /api/",
    "",
    `Sitemap: ${absoluteUrl("/sitemap.xml")}`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
