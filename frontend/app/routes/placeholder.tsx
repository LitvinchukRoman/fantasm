import { data, Link } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { noindexSeo } from "~/lib/seo";
import type { Route } from "./+types/placeholder";

const PAGES: Record<string, { title: string; body: string; description: string }> = {
  "/ideas/new": {
    title: "Запропонувати ідею",
    body: "Форма публікації з’явиться разом зі стрічкою. Вид ідеї: стартап, проєкт, подія, книжковий клуб, волонтерство або інше.",
    description: "Опублікуй стартап, проєкт, подію чи клуб на Fantasm.",
  },
};

export function loader({ request }: Route.LoaderArgs) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  const page = PAGES[path];
  if (!page) throw data("Not found", { status: 404 });
  return { ...page, path };
}

// Заглушка без контенту — тонка сторінка. У індекс вона піде, коли тут з'являться події й форма.
export function meta({ data }: Route.MetaArgs) {
  if (!data) return [];
  return noindexSeo({ title: `${data.title}, Fantasm`, description: data.description, path: data.path });
}

export default function Placeholder({ loaderData }: Route.ComponentProps) {
  return (
    <GuideFrame>
      <h1 className="text-3xl font-semibold text-[var(--color-text)]">{loaderData.title}</h1>
      <p className="mt-3 max-w-xl text-lg text-[var(--color-text-muted)]">{loaderData.body}</p>
      <Link
        to="/ideas/new"
        prefetch="intent"
        className="mt-8 inline-flex rounded-[var(--radius-control)] bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-bg)]"
      >
        Запропонувати ідею
      </Link>
    </GuideFrame>
  );
}
