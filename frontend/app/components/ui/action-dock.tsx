import type { ReactNode } from "react";

/**
 * Плаваюча пігулка з головними діями сторінки (аналог плаваючого нава референсу).
 * Фіксована внизу по центру, враховує safe-area на телефонах. Тінь тут доречна: елемент літає над сторінкою.
 * `visible=false` ховає док (він виїжджає знизу, коли дії в шапці зникли з екрана); прихований док
 * недосяжний для клавіатури й читалок (`inert`).
 */
export function ActionDock({ label, visible = true, children }: { label: string; visible?: boolean; children: ReactNode }) {
  return (
    <div
      inert={!visible}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] transition-[transform,opacity] duration-300 ease-[var(--ease-out-expo)] motion-reduce:transition-opacity ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0 motion-reduce:translate-y-0"
      }`}
    >
      <div
        role="toolbar"
        aria-label={label}
        className="pointer-events-auto flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-bg)]/80 p-1.5 shadow-[0_16px_40px_rgb(0_0_0/0.5)] backdrop-blur-2xl saturate-150"
      >
        {children}
      </div>
    </div>
  );
}
