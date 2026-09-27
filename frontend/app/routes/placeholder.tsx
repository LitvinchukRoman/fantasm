import { GuideFrame } from "~/components/guides/frame";

const PAGES: Record<string, { title: string; body: string }> = {
  "/events": {
    title: "Події",
    body: "Список подій з’явиться тут, щойно бекенд віддасть стрічку. Поки що подій немає.",
  },
  "/login": {
    title: "Вхід",
    body: "Вхід через Microsoft НаУКМА підключимо разом з акаунтами. Печатка могилянця з’явиться після верифікації пошти ukma.edu.ua.",
  },
  "/ideas/new": {
    title: "Запропонувати ідею",
    body: "Форма публікації з’явиться разом зі стрічкою. Вид ідеї: стартап, проєкт, подія, книжковий клуб, волонтерство або інше.",
  },
};

export function loader({ request }: { request: Request }) {
  const page = PAGES[new URL(request.url).pathname];
  if (!page) throw new Response("Not found", { status: 404 });
  return page;
}

export function meta({ data }: { data: { title: string } | undefined }) {
  return [{ title: data ? `${data.title}, Fantasm` : "Fantasm" }];
}

export default function Placeholder({ loaderData }: { loaderData: { title: string; body: string } }) {
  return (
    <GuideFrame>
      <h1 className="text-3xl font-semibold text-[var(--color-text)]">{loaderData.title}</h1>
      <p className="mt-3 max-w-xl text-lg text-[var(--color-text-muted)]">{loaderData.body}</p>
      <a
        href="/ideas/new"
        className="mt-8 inline-flex rounded-[var(--radius-control)] bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-bg)]"
      >
        Запропонувати ідею
      </a>
    </GuideFrame>
  );
}
