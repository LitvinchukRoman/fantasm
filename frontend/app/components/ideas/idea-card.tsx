import { useEffect, useState } from "react";
import { Link } from "react-router";
import { RelativeTime } from "~/components/ui/relative-time";
import { CATEGORY_LABELS, eventWhen, type IdeaCard as IdeaCardData } from "~/lib/ideas";

const HOVER_PAUSE_MS = 400;
const EXPAND_PAUSE_MS = 1500;
const TYPE_MS = 36;
const NEON_LETTERS = 14;
const SOLID_LETTERS = 2;

type ScrollGate = { hover: boolean; expand: boolean };

let scrollGate: ScrollGate = { hover: true, expand: true };
let hoverTimer = 0;
let expandTimer = 0;
let scrollListening = false;
const scrollSubs = new Set<(gate: ScrollGate) => void>();

function publishScrollGate(next: ScrollGate) {
  scrollGate = next;
  scrollSubs.forEach((fn) => fn(next));
}

function onWindowScroll() {
  publishScrollGate({ hover: false, expand: false });
  window.clearTimeout(hoverTimer);
  window.clearTimeout(expandTimer);
  hoverTimer = window.setTimeout(() => {
    publishScrollGate({ ...scrollGate, hover: true });
  }, HOVER_PAUSE_MS);
  expandTimer = window.setTimeout(() => {
    publishScrollGate({ ...scrollGate, expand: true });
  }, EXPAND_PAUSE_MS);
}

function useScrollGate() {
  const [gate, setGate] = useState(scrollGate);
  useEffect(() => {
    scrollSubs.add(setGate);
    if (!scrollListening) {
      scrollListening = true;
      window.addEventListener("scroll", onWindowScroll, { passive: true });
    }
    return () => {
      scrollSubs.delete(setGate);
    };
  }, []);
  return gate;
}

function IconUp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15.5V5M5.5 9.5 10 4.5l4.5 5" />
    </svg>
  );
}

function IconChat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 5.5h12v8H7.5L4 16.5V5.5Z" strokeLinejoin="round" />
    </svg>
  );
}

function IconPeople({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="7.5" cy="7" r="2.2" />
      <path d="M3.2 15.2c.5-2 2.2-3.2 4.3-3.2s3.8 1.2 4.3 3.2" strokeLinecap="round" />
      <circle cx="13.2" cy="7.4" r="1.7" />
      <path d="M13 12.1c1.6.2 2.9 1.3 3.4 3" strokeLinecap="round" />
    </svg>
  );
}

/** Голос у лівому верхньому куті. Клік веде на вхід, доки немає сесії. */
export function VoteControl({ score, className }: { score: number; className?: string }) {
  return (
    <Link
      to="/login"
      prefetch="intent"
      aria-label="Підтримати ідею"
      className={
        className ??
        "inline-flex h-fit shrink-0 flex-col items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-strong)] px-3 py-2 text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]"
      }
    >
      <IconUp className="size-5" />
      <span className="text-sm font-semibold tabular-nums">{score}</span>
    </Link>
  );
}

function letterColor(distanceFromPen: number, span: number) {
  if (distanceFromPen < SOLID_LETTERS) return "#ff6363";
  const t = (distanceFromPen - (SOLID_LETTERS - 1)) / Math.max(1, span - SOLID_LETTERS);
  const channel = Math.round(99 + (255 - 99) * t);
  const alpha = 1 - 0.45 * t;
  return `rgb(255 ${channel} ${channel} / ${alpha})`;
}

function TypedStory({ text, count }: { text: string; count: number }) {
  const writing = count < text.length;
  const edge = writing ? NEON_LETTERS : 0;
  const start = Math.max(0, count - edge);
  const done = text.slice(0, start);
  const live = text.slice(start, count);
  return (
    <>
      {done}
      {live.split("").map((char, index) => (
        <span key={start + index} style={{ color: letterColor(live.length - 1 - index, live.length) }}>
          {char}
        </span>
      ))}
    </>
  );
}

function AuthorRow({ idea }: { idea: IdeaCardData }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <span className="flex shrink-0 items-center gap-3 tabular-nums">
        <span className="inline-flex items-center gap-1">
          <IconChat className="size-3.5" /> {idea.comments}
        </span>
        <span className="inline-flex items-center gap-1">
          <IconPeople className="size-3.5" /> {idea.participants}
        </span>
      </span>
    </div>
  );
}

export function IdeaCard({ idea }: { idea: IdeaCardData }) {
  const gate = useScrollGate();
  const [hover, setHover] = useState(false);
  const [typed, setTyped] = useState(0);
  const open = hover && gate.expand;
  const hot = hover && gate.hover;
  const { story } = idea;
  const isEvent = idea.category === "EVENT" && idea.eventAt;

  useEffect(() => {
    if (!open) {
      setTyped(0);
      return;
    }
    let count = 0;
    const timer = window.setInterval(() => {
      count += 1;
      setTyped(count);
      if (count >= story.length) window.clearInterval(timer);
    }, TYPE_MS);
    return () => window.clearInterval(timer);
  }, [open, story]);

  return (
    <div
      className="ray-hit"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setTyped(0);
      }}
    >
    <article
      className={
        "ray-window flex items-start gap-4 p-5 " +
        (hot ? "is-hot " : "") +
        (open ? "is-open " : "") +
        (gate.expand ? "" : "is-scrolling")
      }
    >
      <RelativeTime className="ray-date" iso={idea.createdAt} />
      <VoteControl score={idea.votes} className="ray-vote" />
      <div className="min-w-0 flex-1 pr-24">
        <p className="ray-kicker">
          {CATEGORY_LABELS[idea.category]}
          {idea.campus ? ` · ${idea.campus.label}` : ""}
          {isEvent ? ` · ${eventWhen(idea.eventAt!)}` : ""}
          {idea.tags.map((tag) => (
            <Link key={tag.slug} to={`/ideas?tag=${tag.slug}`} preventScrollReset>
              {` · #${tag.label}`}
            </Link>
          ))}
        </p>
        <Link to={`/ideas/${idea.slug}`} prefetch="intent" className="block">
          <h2 className="ray-title">{idea.title}</h2>
          <p className="ray-summary">
            {open && typed > 0 ? <TypedStory text={story} count={typed} /> : idea.summary}
          </p>
        </Link>
        <footer>
          <AuthorRow idea={idea} />
        </footer>
      </div>
    </article>
    </div>
  );
}
