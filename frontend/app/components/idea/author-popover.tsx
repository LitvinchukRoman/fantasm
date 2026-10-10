import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "react-router";
import { IconArrowRight } from "~/components/landing/icons";
import { UserAvatar } from "~/components/ui/user-avatar";
import { VerifiedSeal } from "~/components/ui/verified-seal";
import { formatShortDate } from "~/lib/ideas";
import { isGeneratedHandle } from "~/lib/profile";
import type { AuthorPreview } from "~/lib/users.server";

type Anchor = { top: number; bottom: number; left: number };
type OpenState = { scope: string; handle: string; anchor: Anchor };

type Context = {
  profiles: Record<string, AuthorPreview>;
  open: (handle: string, anchor: Anchor) => void;
};

const Ctx = createContext<Context | null>(null);

const WIDTH = 360;
const ESTIMATED_HEIGHT = 440;
const GAP = 10;
const MARGIN = 12;

/**
 * Профіль автора відкривається маленьким попапом біля імені: читач лишається в ідеї.
 * Стан прив'язаний до `scope` (slug ідеї), тож перехід на іншу ідею закриває його.
 * Переходу на окрему сторінку профілю тут поки немає навмисно.
 */
export function AuthorPopoverProvider({
  profiles,
  scope,
  children,
}: {
  profiles: Record<string, AuthorPreview>;
  scope: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<OpenState | null>(null);
  const current = state && state.scope === scope ? state : null;
  const open = useCallback(
    (handle: string, anchor: Anchor) =>
      setState((prev) =>
        prev && prev.scope === scope && prev.handle === handle
          ? null
          : { scope, handle, anchor },
      ),
    [scope],
  );
  const close = useCallback(() => setState(null), []);
  const profile = current ? profiles[current.handle] : undefined;

  return (
    <Ctx.Provider value={{ profiles, open }}>
      {children}
      {current && profile && (
        <Popover profile={profile} anchor={current.anchor} onClose={close} />
      )}
    </Ctx.Provider>
  );
}

/** Фото людини зі сторінки ідеї: профілі всіх, хто на ній згаданий, лоадер уже завантажив. */
export function useAuthorAvatar(handle: string): string | undefined {
  return useContext(Ctx)?.profiles[handle]?.avatarUrl;
}

/**
 * Ім'я автора. Для відомого профілю це кнопка, що відкриває попап; без даних профілю лишається звичайним посиланням.
 */
export function AuthorLink({
  handle,
  className,
  children,
}: {
  handle: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = useContext(Ctx);
  if (!ctx?.profiles[handle]) {
    return (
      <Link to={`/u/${handle}`} prefetch="none" className={className}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      data-author-trigger=""
      className={`${className ?? ""} cursor-pointer text-left`}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        ctx.open(handle, {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
        });
      }}
    >
      {children}
    </button>
  );
}

/** Кутова мітка рамки, як у HUD-панелях: чотири короткі «скоби» по кутах. */
function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute size-2.5 border-white/50 ${className}`}
    />
  );
}

/**
 * Попап у мові сайту-референсу (saifullah.dev): гостра рамка з кутовими мітками, моно-підписи в дужках,
 * нумеровані розділи `01 // …`, рядки «ключ / значення» з тонкими лініями.
 */
function Popover({
  profile,
  anchor,
  onClose,
}: {
  profile: AuthorPreview;
  anchor: Anchor;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (
        ref.current?.contains(target as Node) ||
        target?.closest?.("[data-author-trigger]")
      )
        return;
      onClose();
    };
    // Позиція зафіксована на момент кліку: при прокрутці чи зміні розміру просто закриваємо.
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("scroll", onClose, { passive: true });
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("scroll", onClose);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const narrow =
    typeof window !== "undefined" && window.innerWidth < WIDTH + 24;
  const style: React.CSSProperties = narrow
    ? { left: 12, right: 12 }
    : { width: WIDTH };
  if (typeof window !== "undefined") {
    if (!narrow)
      style.left = Math.max(
        12,
        Math.min(anchor.left, window.innerWidth - WIDTH - 12),
      );
    // Відкриваємо з того боку від імені, де більше місця, і обмежуємо висоту: решта прокручується всередині.
    const below = window.innerHeight - anchor.bottom - GAP - MARGIN;
    const above = anchor.top - GAP - MARGIN;
    if (below >= Math.min(ESTIMATED_HEIGHT, above)) {
      style.top = anchor.bottom + GAP;
      style.maxHeight = below;
    } else {
      style.bottom = window.innerHeight - anchor.top + GAP;
      style.maxHeight = above;
    }
  }

  const rows: { key: string; value: React.ReactNode }[] = [
    {
      key: "Ідей",
      value: <span className="tabular-nums">{profile.ideasCount}</span>,
    },
    {
      key: "Карма",
      value: <span className="tabular-nums">{profile.karma}</span>,
    },
    ...(profile.faculty ? [{ key: "Факультет", value: profile.faculty }] : []),
    {
      key: "З нами з",
      value: (
        <time dateTime={profile.joinedAt}>
          {formatShortDate(profile.joinedAt)}
        </time>
      ),
    },
  ];

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={`Профіль: ${profile.name}`}
      style={style}
      className="author-pop fixed z-[70] overflow-y-auto overscroll-contain rounded-[4px] border border-[var(--color-border-strong)] bg-[var(--color-bg)]/92 shadow-[0_24px_64px_rgba(0,0,0,0.6)] outline-none backdrop-blur-xl"
    >
      <Corner className="top-1 left-1 border-t border-l" />
      <Corner className="top-1 right-1 border-t border-r" />
      <Corner className="bottom-1 left-1 border-b border-l" />
      <Corner className="right-1 bottom-1 border-r border-b" />

      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-5 py-3">
        <span className="hud-label">[ Профіль ]</span>
        <button
          type="button"
          onClick={onClose}
          className="hud-label transition-colors hover:!text-[var(--color-text)]"
          aria-label="Закрити профіль"
        >
          [ Esc ]
        </button>
      </div>

      <div className="px-5 pt-5">
        <div className="flex items-center gap-4">
          <UserAvatar name={profile.name} src={profile.avatarUrl} className="size-12 text-lg" />
          <div className="min-w-0">
            <h2 className="display-entity text-xl [overflow-wrap:anywhere]">
              {profile.name}
            </h2>
            {!isGeneratedHandle(profile.handle) && <p className="hud-label mt-1">@{profile.handle}</p>}
          </div>
        </div>
        {profile.verified && (
          <div className="mt-4">
            <VerifiedSeal />
          </div>
        )}
        {profile.bio && (
          <p className="mt-4 text-sm leading-relaxed text-[var(--color-text-muted)]">
            {profile.bio}
          </p>
        )}
      </div>

      <dl className="mx-5 mt-5 border-t border-[var(--color-border)]">
        {rows.map((row, index) => (
          <div
            key={row.key}
            className="grid grid-cols-[2.25rem_1fr_auto] items-baseline gap-2 border-b border-[var(--color-border)] py-2.5"
          >
            <dt className="hud-label tabular-nums !text-[var(--color-accent)]">
              {String(index + 1).padStart(2, "0")}
            </dt>
            <dt className="hud-label">{row.key}</dt>
            <dd className="text-sm text-[var(--color-text)]">{row.value}</dd>
          </div>
        ))}
      </dl>

      {profile.ideas.length > 0 && (
        <section className="px-5 pt-5" aria-label="Останні ідеї">
          <h3 className="hud-label flex items-center gap-3 !text-[var(--color-text-muted)]">
            <span className="tabular-nums text-[var(--color-accent)]">
              {String(rows.length + 1).padStart(2, "0")}
            </span>
            <span aria-hidden="true">//</span>
            <span>Останні ідеї</span>
          </h3>
          <ul className="mt-3 border-t border-[var(--color-border)]">
            {profile.ideas.map((idea, index) => (
              <li
                key={idea.slug}
                className="border-b border-[var(--color-border)]"
              >
                <Link
                  to={`/ideas/${idea.slug}`}
                  prefetch="intent"
                  className="group grid grid-cols-[2.25rem_1fr_auto] items-baseline gap-2 py-2.5 text-sm text-[var(--color-text)] transition-colors hover:text-[var(--color-accent)]"
                >
                  <span className="hud-label tabular-nums">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="line-clamp-2 [overflow-wrap:anywhere]">
                    {idea.title}
                  </span>
                  <IconArrowRight className="size-3.5 text-[var(--color-text-faint)] transition-colors group-hover:text-[var(--color-accent)]" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="h-5" aria-hidden="true" />
    </div>
  );
}
