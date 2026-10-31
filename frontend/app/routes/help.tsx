import { useSearchParams } from "react-router";
import { GuideFrame } from "~/components/guides/frame";
import { SupportChat } from "~/components/support/support-chat";
import { noindexSeo } from "~/lib/seo";

export const meta = () =>
  noindexSeo({
    title: "Допомога, Fantasm",
    description: "Відповіді на часті питання про Fantasm і чат підтримки: премодерація, печатка могилянця, скарги, видимість ідей.",
    path: "/help",
  });

/** Короткі відповіді на те, про що питають найчастіше. Факти збігаються з правилами бекенду. */
const FAQ = [
  {
    q: "Чому моєї ідеї немає в стрічці?",
    a: "Найчастіше вона на премодерації. Перші ідеї авторів спершу переглядає модератор, а після трьох схвалених ідей публікація йде без черги. Могилянці з печаткою черги не чекають.",
  },
  {
    q: "Як отримати печатку могилянця?",
    a: "Увійди через Microsoft з університетським акаунтом НаУКМА (пошта в домені ukma.edu.ua). Пошти самої по собі замало. Вхід через Microsoft створює окремий профіль: ідеї з профілю Google автоматично не перенесуться.",
  },
  {
    q: "Мою ідею сховали. Що робити?",
    a: "Після пʼяти скарг ідея автоматично ховається, доки її не перегляне модератор. Напиши в чат: асистент перевірить скарги й передасть модератору оскарження разом із тим, що зʼясував.",
  },
  {
    q: "Скільки ідей можна опублікувати?",
    a: "До пʼяти ідей на добу. Ліміт захищає стрічку від спаму й однаковий для всіх.",
  },
  {
    q: "Хто бачить мою ідею?",
    a: "Залежить від видимості: усі, лише ті, хто увійшов, або лише могилянці. Ідею, яку тобі не можна бачити, сайт показує як «не знайдено».",
  },
];

/**
 * Сторінка допомоги. Заголовок і відповіді є в серверному HTML, чат оживає після гідратації.
 * Параметри: `?idea=<slug>` (прийшли з ідеї), `?topic=login|seal|…` (тема з посилання),
 * `?ticket=<id>` (відкрили зі сповіщення про відповідь підтримки).
 */
export default function Help() {
  const [params] = useSearchParams();
  const ideaSlug = params.get("idea") || undefined;
  const topic = params.get("topic") || (ideaSlug ? "idea" : undefined);
  const ticketId = params.get("ticket") || undefined;

  return (
    <GuideFrame>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_30rem] lg:gap-14">
        <div className="lg:pt-4">
          <p className="hud-label">Допомога</p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--color-text)] sm:text-4xl">Що сталося?</h1>
          <p className="mt-4 max-w-xl text-lg text-[var(--color-text-muted)]">
            Асистент дивиться твій акаунт та ідеї й пояснює, що відбувається, за кілька секунд. Те, що вирішує людина, він передає
            модератору разом із тим, що зʼясував, і відповідь приходить сюди та в сповіщення.
          </p>

          <h2 className="hud-label mt-12">Часті питання</h2>
          <ul className="mt-4 divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
            {FAQ.map((item) => (
              <li key={item.q}>
                <details className="group py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[var(--color-text)] [&::-webkit-details-marker]:hidden">
                    <span className="font-medium">{item.q}</span>
                    <span aria-hidden="true" className="text-[var(--color-text-faint)] transition-transform duration-200 group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-2xl text-[var(--color-text-muted)]">{item.a}</p>
                </details>
              </li>
            ))}
          </ul>
        </div>

        <section
          aria-labelledby="support-title"
          className="flex h-[min(46rem,calc(100dvh-7rem))] min-h-[32rem] flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-bg-soft)] max-lg:order-first lg:sticky lg:top-24"
        >
          <SupportChat context={{ page: "/help", ideaSlug, topic, ticketId }} autoFocus={Boolean(ideaSlug || topic)} />
        </section>
      </div>
    </GuideFrame>
  );
}
