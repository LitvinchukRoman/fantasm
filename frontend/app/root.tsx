import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { api, getCurrentUser, routeApi } from "~/lib/api.server";
import type { User } from "~/lib/api-types";
import type { Route } from "./+types/root";

import "./app.css";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#08090a" />
        <link rel="icon" type="image/jpeg" href="/favicon.jpg" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Onest:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <Meta />
        <Links />
        <noscript>
          <style>{".page-loader{display:none}"}</style>
        </noscript>
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export type RootData = { currentUser: User | null; unread: number };

export async function loader({ request }: Route.LoaderArgs): Promise<RootData> {
  const currentUser = await routeApi(getCurrentUser(request));
  if (!currentUser) return { currentUser: null, unread: 0 };
  try {
    const notifications = await api<{ unread: number }>(request, "/api/me/notifications/unread-count");
    return { currentUser, unread: notifications.unread };
  } catch {
    return { currentUser, unread: 0 };
  }
}

const LINK_PRIMARY =
  "inline-flex items-center rounded-[var(--radius-control)] bg-[var(--color-accent)] px-5 py-2.5 text-sm font-medium text-[var(--color-bg)] transition-all duration-150 hover:bg-[var(--color-accent-strong)] hover:scale-105";
const LINK_SECONDARY =
  "inline-flex items-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-5 py-2.5 text-sm font-medium text-[var(--color-text)] transition-all duration-150 hover:bg-[var(--color-surface-strong)] hover:scale-105";

/**
 * 404 і збої рендеру в дизайні сайту. `noindex` обов'язковий: без нього
 * помилкова сторінка може потрапити в індекс як «soft 404». Статус відповіді
 * (404/500) виставляє сервер з того, що кинув лоадер.
 */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const status = isRouteErrorResponse(error) ? error.status : 500;
  const notFound = status === 404;
  const title = notFound ? "Сторінку не знайдено" : "Щось пішло не так";
  const body = notFound
    ? "Можливо, посилання застаріло або ідею прибрав автор. Почніть зі стрічки чи гайдів."
    : "Ми вже бачимо помилку. Спробуйте оновити сторінку за хвилину.";
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

  return (
    <>
      <title>{`${title}, Fantasm`}</title>
      <meta name="robots" content="noindex, follow" />
      <GuideFrame>
        <section className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center text-center">
          <p className="hero-display tabular-nums text-[var(--color-accent)]" aria-hidden="true">
            {status}
          </p>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight text-[var(--color-text)] sm:text-4xl">{title}</h1>
          <p className="mt-3 max-w-md text-lg text-[var(--color-text-muted)]">{body}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/" className={LINK_PRIMARY}>
              На головну
            </Link>
            <Link to="/ideas" prefetch="intent" className={LINK_SECONDARY}>
              Усі ідеї
            </Link>
            <Link to="/guides" prefetch="intent" className={LINK_SECONDARY}>
              Гайди
            </Link>
          </div>
          {stack ? (
            <pre className="mt-10 w-full overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left text-xs text-[var(--color-text-muted)]">
              {stack}
            </pre>
          ) : null}
        </section>
      </GuideFrame>
    </>
  );
}
