import { Children, type CSSProperties, type ReactNode } from "react";

/**
 * Плаваюча пігулка з головними діями сторінки (аналог плаваючого нава референсу).
 * Фіксована внизу по центру, враховує safe-area на телефонах. Тінь тут доречна: елемент літає над сторінкою.
 * `visible=false` ховає док (він виїжджає знизу, коли дії в шапці зникли з екрана); прихований док
 * недосяжний для клавіатури й читалок (`inert`).
 *
 * Рух (стилі `.action-dock*` в app.css): пігулка виїжджає знизу, кнопки в ній підхоплюються по черзі,
 * ховається вона тим самим шляхом, але швидше й без черги. Усе на transition, бо док перемикається при кожному
 * проході повз блок дій, і transition підхоплює рух з поточного місця, а keyframes стартували б заново.
 */
export function ActionDock({ label, visible = true, children }: { label: string; visible?: boolean; children: ReactNode }) {
  return (
    <div
      inert={!visible}
      data-visible={visible}
      className="action-dock pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
    >
      <div
        role="toolbar"
        aria-label={label}
        className="pointer-events-auto flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-bg)]/80 p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.5)] backdrop-blur-2xl saturate-150"
      >
        {Children.toArray(children).map((child, index) => (
          <div key={index} className="action-dock__item flex items-center" style={{ "--i": index } as CSSProperties}>
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
