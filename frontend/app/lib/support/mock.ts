import type {
  Attachment,
  Autonomy,
  SendInput,
  StreamEvent,
  StreamHandlers,
  SuggestedAction,
  SupportMessage,
  SupportStage,
  SupportTransport,
  TicketSnapshot,
  TicketStatus,
  TraceStep,
} from "./types";

/**
 * Mock-транспорт для демо без бекенду (`VITE_SUPPORT_MOCK=true`). Відтворює сценарії S1–S7 з
 * CONTEXT.md тією самою послідовністю подій, що й справжній pipeline: trace по кроках →
 * повідомлення бота → статус. Детермінований: однаковий текст дає однакові події.
 */

export type ScenarioId =
  | "S1_premoderation"
  | "S2_appeal"
  | "S3_injection"
  | "S4_seal"
  | "S5_howto"
  | "S6_login"
  | "S7_push"
  | "B1_plans"
  | "B2_cancel_plan"
  | "B3_refund"
  | "B4_cancel_sponsorship"
  | "billing_signin"
  | "safety"
  | "data_request"
  | "human"
  | "thanks"
  | "screenshot"
  | "unclear";

interface Reply {
  text: string;
  actions?: SuggestedAction[];
}

export interface Scenario {
  id: ScenarioId;
  /** Підписи кроків trace у порядку виконання. */
  steps: [SupportStage, string][];
  reply: Reply;
  status: TicketStatus;
  autonomy: Autonomy;
  /** Для approve: що напише модератор, коли «схвалить» у демо. */
  approval?: Reply;
  /** Бот діє з підписками людини: без токена особи (анонім) замість цього просить увійти. */
  needsIdentity?: boolean;
}

const BILLING_CONTEXT: [SupportStage, string] = ["context", "Дивлюсь твій план і підписки…"];

const CLASSIFY: [SupportStage, string] = ["classify", "Розбираюсь, про що питання…"];
const CONTEXT: [SupportStage, string] = ["context", "Дивлюсь твій акаунт…"];
const DECIDE: [SupportStage, string] = ["decide", "Вирішую, що робити…"];
const RENDER: [SupportStage, string] = ["render", "Пишу відповідь…"];
const VALIDATE: [SupportStage, string] = ["validate", "Перевіряю відповідь…"];

const SCENARIOS: Record<ScenarioId, Scenario> = {
  S1_premoderation: {
    id: "S1_premoderation",
    steps: [CLASSIFY, CONTEXT, ["investigate", "Перевіряю твою ідею…"], DECIDE, RENDER, VALIDATE],
    reply: {
      text: "Твоя ідея «Книжковий клуб Могилянки» не зникла: вона на премодерації вже 3 год. Перші ідеї нових авторів спершу переглядає модератор, а після 3 схвалених ідей публікація йде без черги (у тебе зараз 0). Щойно ідею схвалять, прийде сповіщення.",
      actions: [{ label: "Відкрити ідею", to: "/ideas" }],
    },
    status: "awaiting_customer",
    autonomy: "auto",
  },
  S2_appeal: {
    id: "S2_appeal",
    steps: [
      CLASSIFY,
      CONTEXT,
      ["investigate", "Перевіряю скарги на ідею…"],
      DECIDE,
      RENDER,
      VALIDATE,
      ["route", "Передаю модератору з доказами…"],
    ],
    reply: {
      text: "Розумію, що це неприємно, зараз розберемось. Я перевірив скарги на ідею «Хакатон для першокурсників»: вони схожі на скоординовані. Повернути ідею може лише модератор, тому я передав йому пропозицію відновити її разом із доказами. Рішення прийде сюди й у сповіщення.",
    },
    status: "awaiting_approval",
    autonomy: "approve",
    approval: {
      text: "Модератор переглянув скарги й відновив ідею «Хакатон для першокурсників». Вона знову в стрічці. Дякуємо, що написала.",
      actions: [{ label: "Відкрити стрічку", to: "/ideas" }],
    },
  },
  S3_injection: {
    id: "S3_injection",
    steps: [["prefilter", "Перевіряю повідомлення…"], CLASSIFY, DECIDE, ["route", "Передаю людині…"]],
    reply: {
      text: "Я не можу змінювати ролі чи свої правила: модераторів призначають адміністратори, а не підтримка. Я передав твоє повідомлення людині з команди.",
    },
    status: "escalated",
    autonomy: "escalate",
  },
  S4_seal: {
    id: "S4_seal",
    steps: [CLASSIFY, CONTEXT, ["investigate", "Перевіряю, як ти входиш…"], DECIDE, RENDER, VALIDATE],
    reply: {
      text: "Печатку дає лише вхід через Microsoft з університетським акаунтом НаУКМА (пошта в домені ukma.edu.ua), а твій поточний вхід через Google. Зверни увагу: вхід через Microsoft створить окремий профіль, ідеї з поточного автоматично не перенесуться. Якщо профілі треба об'єднати, напиши, і я передам адміністраторам.",
      actions: [{ label: "Увійти через Microsoft", to: "/login" }],
    },
    status: "awaiting_customer",
    autonomy: "auto",
  },
  S5_howto: {
    id: "S5_howto",
    steps: [CLASSIFY, ["context", "Шукаю в гайдах…"], DECIDE, RENDER, VALIDATE],
    reply: {
      text: "Опиши ідею на Fantasm і додай, кого шукаєш: ролі, навички, скільки часу на тиждень. Люди, яким ідея відгукнеться, подадуть заявку в команду, а ти обереш, кого взяти. Детальніше, де ще шукати людей у Могилянці, є в гайді.",
      actions: [{ label: "Гайд: як знайти команду", to: "/campus/yak-znaity-komandu-dlia-proiektu" }],
    },
    status: "awaiting_customer",
    autonomy: "auto",
  },
  S6_login: {
    id: "S6_login",
    steps: [CLASSIFY, ["investigate", "Перевіряю код помилки…"], DECIDE, RENDER, VALIDATE, ["execute", "Повідомляю команду…"]],
    reply: {
      text: "Код AADSTS50020 означає, що Microsoft не пустив цей акаунт до входу. Схоже, проблема на нашому боці, тому я вже передав код помилки команді. Поки що можеш увійти через Google, а печатку додаси згодом.",
      actions: [{ label: "Сторінка входу", to: "/login" }],
    },
    status: "awaiting_customer",
    autonomy: "auto",
  },
  S7_push: {
    id: "S7_push",
    steps: [CLASSIFY, CONTEXT, ["investigate", "Перевіряю підписку на сповіщення…"], DECIDE, RENDER, VALIDATE],
    reply: {
      text: "На цьому пристрої сповіщення не ввімкнені, тому push не приходять. Увімкни їх у налаштуваннях, а на iPhone спершу додай Fantasm на екран «Додому».",
      actions: [{ label: "Налаштування", to: "/settings" }],
    },
    status: "awaiting_customer",
    autonomy: "auto",
  },
  B1_plans: {
    id: "B1_plans",
    steps: [CLASSIFY, BILLING_CONTEXT, DECIDE, RENDER, VALIDATE],
    reply: {
      text: "Зараз у тебе безкоштовний план «Старт», і всі його активні ідеї вже відкриті. Щоб опублікувати ще одну, заверши одну з них або перейди на «Плюс» чи «Про» (без ліміту). Оплата поки тестова, картка не потрібна.",
      actions: [{ label: "Плани", to: "/pricing" }],
    },
    status: "awaiting_customer",
    autonomy: "auto",
    needsIdentity: true,
  },
  B2_cancel_plan: {
    id: "B2_cancel_plan",
    steps: [CLASSIFY, BILLING_CONTEXT, DECIDE, ["execute", "Вимикаю автопродовження…"], RENDER, VALIDATE],
    reply: {
      text: "Готово: план «Плюс» більше не продовжиться. Він діє до кінця оплаченого місяця, а потім ти перейдеш на «Старт». Ідеї понад ліміт лишаться відкритими, просто нові не опублікуєш, поки активних більше, ніж дозволяє «Старт». Передумаєш — план можна відновити в налаштуваннях.",
      actions: [{ label: "Моя підписка", to: "/settings#pidpyska" }],
    },
    status: "awaiting_customer",
    autonomy: "auto",
    needsIdentity: true,
  },
  B3_refund: {
    id: "B3_refund",
    steps: [CLASSIFY, BILLING_CONTEXT, ["investigate", "Перевіряю останні платежі…"], DECIDE, ["execute", "Повертаю платіж…"], RENDER, VALIDATE],
    reply: {
      text: "Я знайшов останній платіж за «Плюс» і повернув його: він був менше 14 днів тому, тож повернення доступне одразу. Підписка лишається активною до кінця періоду, якщо хочеш і її скасувати, напиши.",
      actions: [{ label: "Історія платежів", to: "/settings#pidpyska" }],
    },
    status: "awaiting_customer",
    autonomy: "auto",
    needsIdentity: true,
  },
  B4_cancel_sponsorship: {
    id: "B4_cancel_sponsorship",
    steps: [CLASSIFY, BILLING_CONTEXT, DECIDE, ["execute", "Скасовую спонсорство…"], RENDER, VALIDATE],
    reply: {
      text: "Скасував твоє спонсорство ідеї «Книжковий клуб Могилянки». Нових списань не буде, а підтримка діє до кінця вже оплаченого місяця. Автор не отримує повідомлення про скасування.",
      actions: [{ label: "Мої підписки", to: "/settings#pidpyska" }],
    },
    status: "awaiting_customer",
    autonomy: "auto",
    needsIdentity: true,
  },
  billing_signin: {
    id: "billing_signin",
    steps: [CLASSIFY, DECIDE, RENDER],
    reply: {
      text: "Щоб я міг подивитися чи змінити твій план і підписки, увійди в акаунт і напиши ще раз. Ціни й ліміти планів є на сторінці «Плани».",
      actions: [
        { label: "Увійти", to: "/login" },
        { label: "Плани", to: "/pricing" },
      ],
    },
    status: "awaiting_customer",
    autonomy: "auto",
  },
  safety: {
    id: "safety",
    steps: [["prefilter", "Перевіряю повідомлення…"], ["route", "Передаю людині…"]],
    reply: {
      text: "Мені дуже шкода, що тобі зараз так важко. Цілодобово й безкоштовно можна поговорити з фахівцями Лайфлайн Україна за номером 7333, а якщо є загроза життю, телефонуй 112. Я також передав твоє повідомлення людині з нашої команди.",
    },
    status: "escalated",
    autonomy: "escalate",
  },
  data_request: {
    id: "data_request",
    steps: [["prefilter", "Перевіряю повідомлення…"], CLASSIFY, DECIDE, ["route", "Передаю адміністратору…"]],
    reply: {
      text: "Я зафіксував твій запит щодо персональних даних і передав адміністратору. Його виконають протягом 30 днів, а результат прийде сюди й у сповіщення.",
    },
    status: "awaiting_approval",
    autonomy: "approve",
  },
  human: {
    id: "human",
    steps: [CLASSIFY, DECIDE, ["route", "Передаю людині…"]],
    reply: { text: "Добре, передаю людині з команди. Відповідь прийде сюди й у сповіщення." },
    status: "escalated",
    autonomy: "escalate",
  },
  thanks: {
    id: "thanks",
    steps: [CLASSIFY, RENDER],
    reply: { text: "Радий, що вийшло! Якщо буде ще питання, пиши сюди." },
    status: "solved",
    autonomy: "auto",
  },
  screenshot: {
    id: "screenshot",
    steps: [["prefilter", "Перевіряю вкладення…"], CLASSIFY, RENDER],
    reply: {
      text: "Дякую, скріншот отримав і додав до звернення. Опиши кількома словами, що сталося і що ти очікував побачити, і я перевірю.",
    },
    status: "awaiting_customer",
    autonomy: "auto",
  },
  unclear: {
    id: "unclear",
    steps: [CLASSIFY, DECIDE, ["route", "Передаю людині…"]],
    reply: {
      text: "Не впевнений, що правильно зрозумів питання, тому передав його людині з команди. Відповідь прийде сюди й у сповіщення.",
    },
    status: "escalated",
    autonomy: "escalate",
  },
};

/** Порядок важливий: безпека перевіряється раніше за продуктові теми, як у guard бекенду. */
const RULES: [ScenarioId, RegExp][] = [
  ["safety", /не хочу жити|покінчити з собою|суїцид|вбити себе|kill myself|suicide/i],
  ["S3_injection", /ігноруй|ignore (previous|all)|забудь правила|system prompt|системн\S* промпт|ти (тепер )?адмін|you are (now )?admin|модератором/i],
  ["data_request", /видал\S* (мій |мою |мої )?(акаунт|профіль|дані)|які дані|персональн\S* дан|gdpr/i],
  ["human", /живою людиною|з людиною|жив\S* оператор|покличте людину|talk to a human/i],
  ["S2_appeal", /сховал|приховал|оскарж|нічого не поруш/i],
  ["S1_premoderation", /стрічц|на модерац|не бачу (свою |мою )?ідею|ідея зникла|моєї ідеї немає/i],
  ["S4_seal", /печатк|верифік|могилян/i],
  ["S6_login", /увійти|aadsts|вхід|логін|login/i],
  ["S7_push", /сповіщен|push|пуш/i],
  // Після push: «скасувати підписку на сповіщення» — це про сповіщення, а не про план.
  ["B4_cancel_sponsorship", /спонсор/i],
  ["B3_refund", /поверн\S* (мені )?(гроші|кошти|оплат|платіж)|повернення (коштів|грошей|платежу)|refund|списал\S* (гроші|кошти|двічі)/i],
  ["B2_cancel_plan", /(скасу|відмін|вимкн|зупин|відпис)\S*\s+(\S+\s+)?(підписк|план|плюс|plus|pro|автопродовж)/i],
  // Без \b: у JS-регулярках воно не бачить меж кириличних слів.
  ["B1_plans", /тариф|(^|[^а-яіїєґ])план(и|у|ом|і|ів)?([^а-яіїєґ]|$)|ліміт|більше ідей|скільки коштує|оплат|підписк/i],
  ["S5_howto", /як (знайти|створити|написати|зібрати)|команд/i],
  ["thanks", /дякую|спасибі|thank/i],
];

/** `identified` — чи прийшов токен особи: без нього бот не бачить підписок і просить увійти. */
export function pickScenario(text: string, hasAttachments = false, identified = true): Scenario {
  if (!text.trim() && hasAttachments) return SCENARIOS.screenshot;
  const match = RULES.find(([, pattern]) => pattern.test(text));
  const scenario = SCENARIOS[match ? match[0] : "unclear"];
  return scenario.needsIdentity && !identified ? SCENARIOS.billing_signin : scenario;
}

const REDACTIONS: [RegExp, string][] = [
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[EMAIL]"],
  [/\b(?:\d[ -]?){13,19}\b/g, "[CARD]"],
  [/(?:\+?38[\s-]?)?\(?0[\s-]?\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g, "[PHONE]"],
];

/** Спрощений guard.Redact бекенду: показати в демо, що персональні дані не зберігаються. */
export function redact(text: string): string {
  return REDACTIONS.reduce((acc, [pattern, placeholder]) => acc.replace(pattern, placeholder), text);
}

/** Що відтворити: подія без seq і ticketId плюс затримка перед нею. */
export type Beat = { delayMs: number; event: DistributiveOmit<StreamEvent, "seq" | "ticketId"> };
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function script(scenario: Scenario, customer: SupportMessage, now: () => string, id: () => string): Beat[] {
  const step = (stage: SupportStage, summary: string): TraceStep => ({ stage, summary, at: now() });
  const beats: Beat[] = [
    { delayMs: 0, event: { type: "message", message: { ...customer, text: redact(customer.text) } } },
    { delayMs: 150, event: { type: "status", status: "processing" } },
    { delayMs: 200, event: { type: "trace", step: step("received", "Отримав повідомлення") } },
  ];
  for (const [stage, summary] of scenario.steps) {
    beats.push({ delayMs: 450 + (summary.length % 5) * 90, event: { type: "trace", step: step(stage, summary) } });
  }
  beats.push({
    delayMs: 500,
    event: { type: "message", message: { id: id(), author: "bot", visibility: "public", createdAt: now(), ...scenario.reply } },
  });
  beats.push({ delayMs: 120, event: { type: "status", status: scenario.status, autonomy: scenario.autonomy } });
  return beats;
}

interface MockTicket {
  events: StreamEvent[];
  listeners: Set<StreamHandlers>;
  timers: Set<ReturnType<typeof setTimeout>>;
  /** Наступна подія стане в чергу після вже запланованих. */
  tail: number;
}

export function createMockTransport(options: { approveAfterMs?: number; speed?: number } = {}): SupportTransport {
  const { approveAfterMs = 7000, speed = 1 } = options;
  const tickets = new Map<string, MockTicket>();
  const uploads = new Map<string, Attachment>();
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}_mock_${++counter}`;
  const now = () => new Date().toISOString();

  const ticketFor = (ticketId: string) => {
    let ticket = tickets.get(ticketId);
    if (!ticket) {
      ticket = { events: [], listeners: new Set(), timers: new Set(), tail: Date.now() };
      tickets.set(ticketId, ticket);
    }
    return ticket;
  };

  const emit = (ticketId: string, ticket: MockTicket, event: Beat["event"]) => {
    const full = { ...event, seq: ticket.events.length + 1, ticketId } as StreamEvent;
    ticket.events.push(full);
    for (const listener of ticket.listeners) listener.onEvent(full);
  };

  const play = (ticketId: string, ticket: MockTicket, beats: Beat[]) => {
    let at = Math.max(ticket.tail, Date.now());
    for (const beat of beats) {
      at += beat.delayMs / speed;
      const timer = setTimeout(() => {
        ticket.timers.delete(timer);
        emit(ticketId, ticket, beat.event);
      }, at - Date.now());
      ticket.timers.add(timer);
    }
    ticket.tail = at;
  };

  const snapshot = (ticketId: string): TicketSnapshot => {
    const ticket = ticketFor(ticketId);
    let status: TicketStatus = "processing";
    let autonomy: Autonomy | undefined;
    const messages: SupportMessage[] = [];
    const trace: TraceStep[] = [];
    for (const event of ticket.events) {
      if (event.type === "trace") trace.push(event.step);
      else if (event.type === "message") {
        const index = messages.findIndex((message) => message.id === event.message.id);
        if (index === -1) messages.push(event.message);
        else messages[index] = event.message;
      } else {
        status = event.status;
        autonomy = event.autonomy ?? autonomy;
      }
    }
    return { id: ticketId, status, autonomy, messages, trace, lastSeq: ticket.events.length };
  };

  return {
    async send(input: SendInput, identity?: string | null) {
      const ticketId = input.ticketId && tickets.has(input.ticketId) ? input.ticketId : nextId("t");
      const ticket = ticketFor(ticketId);
      const messageId = nextId("m");
      const attachments = (input.attachmentIds ?? []).flatMap((id) => uploads.get(id) ?? []);
      const customer: SupportMessage = {
        id: messageId,
        author: "customer",
        visibility: "public",
        text: input.text,
        createdAt: now(),
        ...(attachments.length ? { attachments } : {}),
      };
      const scenario = pickScenario(input.text, attachments.length > 0, Boolean(identity));
      const beats = script(scenario, customer, now, () => nextId("m"));
      if (scenario.approval && approveAfterMs >= 0) {
        // У демо без консолі «модератор» схвалює сам, щоб було видно живу відповідь людини.
        beats.push(
          {
            delayMs: approveAfterMs,
            event: { type: "message", message: { id: nextId("m"), author: "agent", visibility: "public", createdAt: now(), ...scenario.approval } },
          },
          { delayMs: 150, event: { type: "status", status: "solved", autonomy: scenario.autonomy } },
        );
      }
      play(ticketId, ticket, beats);
      return { ticketId, messageId };
    },
    async getTicket(ticketId: string) {
      if (!tickets.has(ticketId)) throw { error: "Звернення не знайдено", code: "not_found" };
      return snapshot(ticketId);
    },
    subscribe(ticketId: string, handlers: StreamHandlers) {
      const ticket = ticketFor(ticketId);
      ticket.listeners.add(handlers);
      return () => {
        ticket.listeners.delete(handlers);
      };
    },
    async feedback() {
      // mock нічого не зберігає
    },
    upload(file: File, signal?: AbortSignal) {
      // Імітуємо мережу: що більший файл, то довше, але не більше 1.5 с.
      return new Promise<Attachment>((resolve, reject) => {
        const timer = setTimeout(
          () => {
            const attachment: Attachment = {
              id: nextId("a"),
              name: file.name,
              size: file.size,
              contentType: file.type,
              url: typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : undefined,
            };
            uploads.set(attachment.id, attachment);
            resolve(attachment);
          },
          Math.min(1500, 400 + file.size / 2000) / speed,
        );
        signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    },
  };
}

export const mockTransport = createMockTransport();
