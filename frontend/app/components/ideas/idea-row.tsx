import { useEffect, useRef } from "react";
import { Link } from "react-router";
import { CATEGORY_LABELS, eventWhen, type IdeaCard as IdeaCardData } from "~/lib/ideas";

const PILL_HALF_WIDTH = 64;
const PILL_HALF_HEIGHT = 16;
/** Плашка висить трохи вище курсора. */
const PILL_LIFT = 12;
/** Частка відстані до курсора, яку плашка проходить за кадр (згладжене слідування). */
const PILL_EASE = 0.18;

/**
 * Рядок стрічки ідей: номер, назва, теги й короткий опис зліва, «сигнальна» панель справа
 * (у ідей немає картинок, тому замість прев'ю показуємо голоси; лічильники зʼявляються при наведенні).
 * Плашка «Відкрити» їздить за курсором усередині рядка.
 */
export function IdeaRow({ idea, number, decorative = false }: { idea: IdeaCardData; number: string; decorative?: boolean }) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const isEvent = idea.category === "EVENT" && idea.eventAt;

  // Плашка наздоганяє курсор із затримкою, а не стрибає за ним.
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const frame = useRef(0);

  function paint() {
    const pill = pillRef.current;
    if (!pill) return;
    const dx = target.current.x - current.current.x;
    const dy = target.current.y - current.current.y;
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) {
      current.current = { ...target.current };
      frame.current = 0;
    } else {
      current.current = { x: current.current.x + dx * PILL_EASE, y: current.current.y + dy * PILL_EASE };
      frame.current = requestAnimationFrame(paint);
    }
    pill.style.transform = `translate3d(${current.current.x}px, ${current.current.y}px, 0)`;
  }

  function aim(event: React.PointerEvent<HTMLAnchorElement>, snap: boolean) {
    const rect = event.currentTarget.getBoundingClientRect();
    target.current = {
      x: event.clientX - rect.left - PILL_HALF_WIDTH,
      y: event.clientY - rect.top - PILL_HALF_HEIGHT - PILL_LIFT,
    };
    if (snap) current.current = { ...target.current };
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  }

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  return (
    <Link
      to={`/ideas/${idea.slug}`}
      prefetch="intent"
      tabIndex={decorative ? -1 : undefined}
      onPointerEnter={(event) => aim(event, true)}
      onPointerMove={(event) => aim(event, false)}
      className="idea-row group"
    >
      <span ref={pillRef} aria-hidden="true" className="idea-pill">
        Відкрити
      </span>

      <div className="idea-row-main">
        <p className="idea-num" aria-hidden="true">
          {number}
        </p>
        <div className="idea-meta">
          <h2 className="idea-title">{idea.title}</h2>
          <ul className="idea-tags">
            {idea.visibility === "UKMA_ONLY" && (
              <li className="idea-tag !border-white/30 !text-white font-mono uppercase max-sm:!border-0" title="Тільки для спільноти НаУКМА">
                UKMA_ONLY
              </li>
            )}
            <li className="idea-tag">{CATEGORY_LABELS[idea.category]}</li>
            {idea.campus && <li className="idea-tag idea-tag--minor">{idea.campus.label}</li>}
            {isEvent && <li className="idea-tag">{eventWhen(idea.eventAt!)}</li>}
            {idea.tags.slice(0, 2).map((tag) => (
              <li key={tag.slug} className="idea-tag idea-tag--minor">
                #{tag.label}
              </li>
            ))}
          </ul>
          <p className="idea-summary">{idea.summary}</p>
          {/* На телефонах і планшетах велика панель голосів зникає, лишається ця стисла стрічка. */}
          <p className="idea-stats" aria-hidden="true">
            <span>
              <b>{idea.votes}</b> голосів
            </span>
            <span>
              <b>{idea.comments}</b> комент.
            </span>
            <span>
              <b>{idea.participants}</b> учасн.
            </span>
          </p>
        </div>
      </div>

      <div className="idea-media" aria-hidden="true">
        <div className="idea-frame">
          <div className="idea-scanline" />
          <div className="idea-hud">
            <span className="idea-hud-label">ID: {idea.slug.slice(0, 22).toUpperCase()}</span>
            <span className="idea-hud-row">
              <span className="idea-hud-label">КОМЕНТАРІ {idea.comments}</span>
              <span className="idea-hud-label">УЧАСНИКИ {idea.participants}</span>
            </span>
          </div>
          <div className="idea-zoom">
            <span className="idea-score">{idea.votes}</span>
            <span className="idea-score-label">голосів</span>
          </div>
        </div>
      </div>
      <span className="sr-only">
        {idea.votes} голосів, {idea.comments} коментарів, {idea.participants} учасників
      </span>
    </Link>
  );
}
