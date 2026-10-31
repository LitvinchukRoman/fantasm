import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type SyntheticEvent,
} from "react";
import { clampPanelWidth, isWide, PANEL_WIDTH } from "~/lib/support/placement";
import { SupportChat, type SupportContext } from "./support-chat";

const WIDTH_KEY = "fantasm.support.width";

function readWidth(): number {
  try {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    return clampPanelWidth(saved || PANEL_WIDTH.default, window.innerWidth);
  } catch {
    return PANEL_WIDTH.default;
  }
}

function saveWidth(width: number) {
  try {
    window.localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // заблоковане сховище: ширина просто не запамʼятається
  }
}

/**
 * Бічна панель чату. Окремий чанк: вантажиться лише після наведення чи натискання на «Допомога».
 * <dialog> + showModal() дає top layer, фокус-трап, Esc і inert для решти сторінки; після закриття
 * браузер повертає фокус на кнопку, яка панель відкрила.
 * На desktop панель можна розтягнути за лівий край (мишею або стрілками) чи розгорнути кнопкою
 * в шапці; ширина запамʼятовується, а верстка чату підлаштовується під неї (container queries).
 */
export default function SupportPanel({ open, onClose, context }: { open: boolean; onClose: () => void; context: SupportContext }) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Панель рендериться лише в браузері (лінивий чанк після натискання), тож window вже є.
  const [width, setWidth] = useState(readWidth);
  const [dragging, setDragging] = useState(false);

  // Відкриття запускає CSS-анімацію саме. Закриття спершу програє анімацію виходу (data-closing)
  // і лише після неї закриває <dialog>; запасний таймер — якщо анімації немає (reduced motion).
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open) {
      delete node.dataset.closing;
      if (!node.open) node.showModal();
      return;
    }
    if (!node.open) return;
    node.dataset.closing = "";
    const finish = () => {
      if (!node.hasAttribute("data-closing")) return;
      delete node.dataset.closing;
      node.close();
    };
    const onEnd = (event: AnimationEvent) => {
      if (event.target === node && event.animationName === "support-panel-out") finish();
    };
    node.addEventListener("animationend", onEnd);
    const fallback = window.setTimeout(finish, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 320);
    return () => {
      node.removeEventListener("animationend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [open]);

  // Esc: замість миттєвого закриття браузером — та сама анімація, що й для хрестика.
  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };

  // Вікно звузили: панель не має вилізти за екран.
  useEffect(() => {
    const onResize = () => setWidth((current) => clampPanelWidth(current, window.innerWidth));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const resize = (next: number | ((current: number) => number)) => {
    setWidth((current) => {
      const clamped = clampPanelWidth(typeof next === "function" ? next(current) : next, window.innerWidth);
      saveWidth(clamped);
      return clamped;
    });
  };

  // Клік повз панель закриває її, як Esc.
  const onBackdrop = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    // Панель притиснута до правого краю з полем 12 px: ширина — від курсора до цього краю.
    resize(window.innerWidth - 12 - event.clientX);
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };
  const onHandleKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 96 : 32;
    if (event.key === "ArrowLeft") resize((current) => current + step);
    else if (event.key === "ArrowRight") resize((current) => current - step);
    else if (event.key === "Home") resize(PANEL_WIDTH.min);
    else if (event.key === "End") resize(PANEL_WIDTH.wide);
    else return;
    event.preventDefault();
  };

  const wide = isWide(width);

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onCancel={onCancel}
      onClick={onBackdrop}
      aria-labelledby="support-title"
      className="support-panel"
      data-dragging={dragging || undefined}
      style={{ "--support-width": `${width}px` } as CSSProperties}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Ширина чату"
        aria-valuemin={PANEL_WIDTH.min}
        aria-valuemax={PANEL_WIDTH.wide}
        aria-valuenow={width}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => resize(wide ? PANEL_WIDTH.default : PANEL_WIDTH.wide)}
        onKeyDown={onHandleKey}
        className="support-resize"
      />
      <SupportChat context={context} onClose={onClose} wide={wide} onToggleWide={() => resize(wide ? PANEL_WIDTH.default : PANEL_WIDTH.wide)} />
    </dialog>
  );
}
