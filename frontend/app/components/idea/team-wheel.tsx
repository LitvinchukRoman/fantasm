import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { motion, useAnimation, useReducedMotion } from "motion/react";
import { useFetcher } from "react-router";
import { IconArrowRight } from "~/components/landing/icons";
import { AuthorLink } from "~/components/idea/author-popover";
import { Button } from "~/components/ui/button";
import { UserAvatar } from "~/components/ui/user-avatar";
import type { Participant } from "~/lib/api-types";
import type { AuthorPreview } from "~/lib/users.server";

function ParticipantActions({ handle }: { handle: string }) {
  const fetcher = useFetcher();
  const pending = fetcher.state !== "idle";
  return (
    <fetcher.Form method="post" className="mt-4 flex gap-2">
      <input type="hidden" name="intent" value="participant-decision" />
      <input type="hidden" name="handle" value={handle} />
      <Button type="submit" name="decision" value="accept" size="sm" disabled={pending}>Прийняти</Button>
      <Button type="submit" name="decision" value="decline" size="sm" variant="secondary" disabled={pending}>Відхилити</Button>
    </fetcher.Form>
  );
}

const VISIBLE = 5;
/** Одна плитка: світлина 5rem і поле навколо, щоб кільце фокуса не впиралося в край кадру. */
const TILE = "6rem";
const EASE: [number, number, number, number] = [0.23, 1, 0.32, 1];

function windowAt(start: number, count: number): number[] {
  const size = Math.min(VISIBLE, count);
  return Array.from({ length: size }, (_, offset) => (start + offset) % count);
}

function PageArrow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="mt-7 grid size-10 shrink-0 place-items-center rounded-full border border-[var(--color-border-strong)] text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      <IconArrowRight className="size-4" />
    </button>
  );
}

/**
 * У кадрі п’ятеро: світлина й імʼя. Чітка та, на яку перейшли;
 * решта розмита, доки на неї не переведуть. Клік відкриває профіль.
 * Якщо людей більше, стрілка справа зрушує ряд на одну людину по колу.
 */
export function TeamWheel({
  participants,
  profiles,
  canDecide,
}: {
  participants: Participant[];
  profiles: Record<string, AuthorPreview>;
  canDecide: boolean;
}) {
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const reduce = useReducedMotion();
  const controls = useAnimation();
  const pageRef = useRef(0);
  const queued = useRef(0);
  const running = useRef(false);
  const mounted = useRef(true);
  const count = participants.length;
  useLayoutEffect(() => {
    if (count === 0) return;
    pageRef.current = ((page % count) + count) % count;
  }, [page, count]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  if (participants.length === 0) return null;

  const start = ((page % count) + count) % count;
  const loops = count > VISIBLE;
  const visible = windowAt(start, count);
  const track = loops ? windowAt(start, count).concat([(start + VISIBLE) % count]) : visible;
  const shown = hover != null && visible.includes(hover) ? hover : visible.includes(active) ? active : visible[0];
  const chosen = participants[Math.min(active, count - 1)];
  const pending = chosen.state === "JOINED" || chosen.state === "INTERESTED";

  const commit = () => {
    const next = (pageRef.current + 1) % count;
    pageRef.current = next;
    setPage(next);
    setHover((current) => (current != null && windowAt(next, count).includes(current) ? current : null));
    setActive((current) => (windowAt(next, count).includes(current) ? current : next));
  };

  const run = async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queued.current > 0 && mounted.current) {
        queued.current -= 1;
        await controls.start({ x: `-${TILE}`, transition: { duration: 0.42, ease: EASE } });
        if (!mounted.current) return;
        flushSync(commit);
        controls.set({ x: 0 });
      }
    } finally {
      running.current = false;
    }
  };

  const turn = () => {
    if (reduce) {
      commit();
      return;
    }
    queued.current += 1;
    void run();
  };

  return (
    <div>
      <div className="flex flex-nowrap items-start gap-2">
        <div className={loops ? "w-[30rem] overflow-hidden py-1" : undefined}>
          <motion.ul
            initial={false}
            animate={controls}
            className={`flex flex-nowrap items-start ${loops ? "" : "gap-x-3"}`}
          >
            {track.map((index, slot) => {
              const person = participants[index];
              const focused = index === shown;
              const profile = profiles[person.handle];
              const spare = loops && slot === VISIBLE;
              return (
                <li
                  key={person.handle}
                  inert={spare}
                  aria-hidden={spare || undefined}
                  className={loops ? "flex w-24 shrink-0 flex-col items-center px-2 pt-2" : "w-24"}
                >
                  <div
                    onMouseEnter={() => setHover(index)}
                    onMouseLeave={() => setHover((current) => (current === index ? null : current))}
                    onFocusCapture={() => setActive(index)}
                    onClick={() => setActive(index)}
                  >
                    <AuthorLink
                      handle={person.handle}
                      className="flex w-full flex-col items-center gap-2 !text-center"
                    >
                      <UserAvatar
                        name={person.name}
                        src={profile?.avatarUrl}
                        className={`size-20 text-2xl transition duration-300 ease-out ${
                          focused
                            ? "scale-105 opacity-100 blur-none ring-2 ring-[var(--color-accent)] ring-offset-2 ring-offset-[var(--color-bg)]"
                            : "scale-95 opacity-75 blur-[6px] saturate-50"
                        }`}
                      />
                      <span
                        className={`line-clamp-2 text-sm leading-tight transition-colors duration-300 ${
                          focused ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text-faint)]"
                        }`}
                      >
                        {person.name}
                      </span>
                    </AuthorLink>
                  </div>
                </li>
              );
            })}
          </motion.ul>
        </div>
        {loops && <PageArrow label="Наступна людина" onClick={turn} />}
      </div>
      {canDecide && pending && <ParticipantActions handle={chosen.handle} />}
    </div>
  );
}
