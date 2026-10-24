import { Link } from "react-router";
import type { Faq } from "~/lib/content-meta";

/**
 * Текстовий блок лендінгу під запит «платформа ідей». FAQ рендериться видимо і
 * дублюється у FAQPage JSON-LD з тих самих LANDING_FAQ, тож розмітка не розходиться з текстом.
 * Лише факти, які вже підтверджує продукт: вхід, видимість ідей, печатка, «Долучитися».
 */
export const LANDING_FAQ: Faq[] = [
  {
    q: "Що таке Fantasm?",
    a: "Fantasm — платформа ідей НаУКМА. Спільнота Києво-Могилянської академії публікує тут стартапи, проєкти, дослідження, події та клуби, голосує за них, обговорює й збирає команди.",
  },
  {
    q: "Хто може опублікувати ідею?",
    a: "Будь-хто з Google або Microsoft-акаунтом, окремий пароль не потрібен. Якщо увійти з поштою ukma.edu.ua, профіль отримає печатку могилянця, знак того, що автор зі спільноти Могилянки.",
  },
  {
    q: "Які ідеї можна публікувати?",
    a: "Стартап, проєкт, подію, книжковий клуб, волонтерську ініціативу, студентську організацію, хакатон, дослідження чи медіа. Ідея не мусить бути бізнесом: підійде й разова зустріч, і клуб, що збирається щотижня.",
  },
  {
    q: "Чи побачать мою ідею поза університетом?",
    a: "Це вирішує автор. Публічну ідею бачать усі відвідувачі платформи, і її індексують пошуковики. Варіант «Лише для НаУКМА» показує ідею тільки верифікованим могилянцям.",
  },
  {
    q: "Як знайти команду для ідеї?",
    a: "Опиши задум і ролі, яких бракує, та поділися посиланням. Однодумці натискають «Долучитися» просто на сторінці ідеї, а голоси й коментарі показують, що задум комусь потрібен.",
  },
];

const linkClass = "font-medium text-[var(--color-text)] underline decoration-[var(--color-accent)] underline-offset-4 hover:text-[var(--color-accent)]";

export function AboutPlatform() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-start">
        <div className="space-y-4 text-[var(--color-text-muted)]">
          <h2 className="max-w-md text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Що таке платформа ідей НаУКМА
          </h2>
          <p>
            Fantasm — платформа ідей спільноти Києво-Могилянської академії. Тут студенти, випускники й друзі
            кампусу публікують задуми, яким потрібна підтримка: від студентського стартапу чи дослідження до
            кінопоказу, книжкового клубу або хакатону. Кожна ідея отримує власну сторінку з голосами
            та обговоренням.
          </p>
          <p>
            На відміну від чатів, де повідомлення губляться за день, ідея на платформі лишається на виду в{" "}
            <Link to="/ideas" className={linkClass}>стрічці ідей</Link>: ті, що збирають підтримку, піднімаються
            вгору, і до них можна долучитися одним натиском. Події з датою потрапляють у{" "}
            <Link to="/events" className={linkClass}>календар подій</Link>, а поради, як знайти співзасновника,
            грант чи місце для заходу, зібрані в <Link to="/guides" className={linkClass}>гайдах</Link>.
          </p>
          <p>
            Автор сам обирає, хто бачить ідею: усі відвідувачі чи лише спільнота НаУКМА. Вхід через Google або
            Microsoft, без окремого пароля, а пошта ukma.edu.ua додає профілю печатку могилянця.
          </p>
        </div>

        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Часті запитання про платформу ідей
          </h2>
          <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border)]">
            {LANDING_FAQ.map((item) => (
              <details key={item.q} className="group bg-[var(--color-surface)]">
                <summary className="cursor-pointer list-none px-5 py-4 font-medium text-[var(--color-text)] [&::-webkit-details-marker]:hidden">
                  {item.q}
                </summary>
                <p className="px-5 pb-5 text-[var(--color-text-muted)]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
