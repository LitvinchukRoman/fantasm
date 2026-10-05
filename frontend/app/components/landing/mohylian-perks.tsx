import { VerifiedSeal } from "~/components/ui/verified-seal";
import { ChecklistX } from "./checklist-x";

const WITHOUT_SEAL = [
  {
    title: "Ідеї «лише НаУКМА»",
    caption: "Не бачить і не знає, що вони існують у стрічці.",
  },
  {
    title: "Повна вага голосу",
    caption: "Голос важить 1 замість 2, у могилянця вдвічі більше впливу.",
  },
  {
    title: "Публікація без черги",
    caption: "Перші ідеї спершу проходять модерацію.",
  },
  {
    title: "Кампус-буст у стрічці",
    caption: "Немає прапора campus і множника 1.5 у гарячому рейтингу.",
  },
];

/**
 * Права картка — той самий список, що clerk.com "Fraud and Abuse
 * Prevention", з крапками замість хрестиків. Текст пунктів — про печатку
 * могилянця (FULL_CONTEXT.md).
 */
export function MohylianPerks() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start">
        <div>
          <VerifiedSeal label="Печатка могилянця" />
          <h2 className="mt-3 max-w-md text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">
            Верифікація відкриває більше можливостей
          </h2>
          <p className="mt-3 max-w-md text-[var(--color-text-muted)]">
            Увійди через Entra НаУКМА з поштою на домені ukma.edu.ua, і
            профіль отримує печатку. Без неї платформа все ще відкрита, але
            частина стрічки й переваг лишається недоступною.
          </p>
        </div>

        <ChecklistX items={WITHOUT_SEAL} className="lg:mt-1" />
      </div>
    </section>
  );
}
