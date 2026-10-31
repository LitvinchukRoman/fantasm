import { lazy, Suspense, useState } from "react";
import { useLocation } from "react-router";
import { track } from "~/lib/analytics";
import { ideaSlugFrom, launcherHidden } from "~/lib/support/placement";

const SupportPanel = lazy(() => import("./panel"));
const preload = () => void import("./panel");

/**
 * Кнопка «Допомога» в правому нижньому куті. Вона є в SSR-HTML кожної сторінки й не тягне
 * залежностей (іконка чату вбудована); чат, reducer і
 * клієнт лежать у чанку панелі, який вантажиться при наведенні, фокусі або натисканні.
 * На телефоні на сторінці ідеї кнопку ховаємо: там унизу док дій.
 */
export function SupportLauncher() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  if (launcherHidden(pathname)) return null;
  const ideaSlug = ideaSlugFrom(pathname);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onPointerEnter={preload}
        onFocus={preload}
        onClick={() => {
          setRequested(true);
          setOpen(true);
          track("ui.click", { target: "support.open" });
        }}
        className={`support-launcher ${ideaSlug ? "hidden sm:inline-flex" : "inline-flex"}`}
      >
        {/* Той самий гліф, що CHAT_PATH в icons.tsx: дубль навмисний, щоб кнопка не тягнула імпортів. */}
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5 text-[var(--color-accent)]">
          <path d="M5 4h10a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H9.5L6 17.25V14.5H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM6.75 8h6.5M6.75 11h4" />
        </svg>
        Допомога
      </button>
      {requested && (
        <Suspense fallback={null}>
          <SupportPanel open={open} onClose={() => setOpen(false)} context={{ page: pathname, ideaSlug }} />
        </Suspense>
      )}
    </>
  );
}
