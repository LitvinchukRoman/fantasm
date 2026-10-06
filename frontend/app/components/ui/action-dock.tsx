import { Children, type CSSProperties, type ReactNode } from "react";

/**
 * Плаваюча пігулка з головними діями сторінки (аналог плаваючого нава референсу).
 * Фіксована внизу по центру, враховує safe-area на телефонах. Тінь тут доречна: елемент літає над сторінкою.
 * `visible=false` ховає док (він виїжджає знизу, коли дії в шапці зникли з екрана); прихований док
 * недосяжний для клавіатури й читалок (`inert`).
 *
 * Рух (стилі `.action-dock*` в app.css): зʼявляється коло, розтягується в панель, потім по черзі зʼявляються кнопки.
 * Ховається у зворотному порядку, але швидше. Фон, рамка й тінь живуть в окремому шарі `.action-dock__shell`. Усе на transition, бо док перемикається при кожному проході повз
 * блок дій, і transition підхоплює рух з поточного місця, а keyframes стартували б заново.
 */
export function ActionDock({ label, visible = true, children }: { label: string; visible?: boolean; children: ReactNode }) {
  return (
    <div
      inert={!visible}
      data-visible={visible}
      className="action-dock pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div role="toolbar" aria-label={label} className="action-dock__bar pointer-events-auto relative flex items-center gap-1 p-1.5">
        <span
          aria-hidden="true"
          className="action-dock__shell absolute top-0 bottom-0 left-1/2 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-bg)]/80 shadow-[0_16px_40px_rgb(0_0_0/0.5)] backdrop-blur-2xl saturate-150"
        />
        {Children.toArray(children).map((child, index) => (
          <div key={index} className="action-dock__item relative flex items-center" style={{ "--i": index } as CSSProperties}>
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
