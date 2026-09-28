/**
 * Зразки ідей з редакційного сіда MVP, щоб картку й сторінку можна було
 * перенести до появи стрічки з Go. Лоадер і є місце підміни на API.
 */
import { NAUKMA, type Idea, type IdeaAuthor, type IdeaCard, type IdeaCategory, type IdeaTag, type IdeaView } from "./ideas";
import { renderMarkdown } from "./markdown.server";

const AUTHOR: IdeaAuthor = { handle: "naukma-ideas", name: "NaUKMA Ideas", verified: true };

const IDEAS: Idea[] = [
  {
    slug: "anomalija-bunt",
    title:
      "АаАа 0123456789 ЦЕЗАГОЛОВОКЯКИЙНЕЗАКІНЧУЄТЬСЯіраптомМАЛЕНЬКІлітериПОТІМЗНОВУВЕЛИКІ 999999 і ще рядок і ще рядок і ще один рядок щоб вилізти за два рядки картки ЗАВЖДИ",
    summary:
      "описОписОПИС 1234567890AaBbCc короткийпотімДОВЖЕЛЕЗНИЙрядокбезпробілівЩОБПРОБИТИСЯКРІЗЬОБРІЗКУ і далі звичайні слова які теж не мають вміститися у два рядки картки бо автор навмисно пише забагато.",
    body: "Це тіло, яке друкується при наведенні. АаАа 0123456789. Коротко. ПОТІМДУЖЕДОВГЕСЛОВОБЕЗЖОДНОГОПРОБІЛУ0123456789щобперевіритиперенос. Далі знову нормальні речення, змішані з ВЕЛИКИМИ і маленькими, і цифрами 42, 7, 100000. Якщо хтось вставляє простиню, картка все одно лишається в своїх межах, а повний текст читається лише тут, літера за літерою.",
    category: "OTHER",
    campus: NAUKMA,
    tags: [
      { slug: "bunt", label: "БунтЯкийНеВміщаєтьсяВРядок1234567890" },
      { slug: "aaa", label: "АаАа0123" },
      { slug: "naukma", label: "НаУКМА" },
      { slug: "overflow", label: "ЩеОдинДовгийТегЩобКікерПішовВКрапки" },
    ],
    author: AUTHOR,
    votes: 999999,
    comments: 888888,
    participants: 777777,
    createdAt: "2026-09-27T12:00:00.000Z",
    eventAt: "2026-12-31T23:59:00.000Z",
    eventLocation: "МісцеЯкеТежНеМаєВміщатисяБоВоноНавмисноДужеДовге 1234567890",
    fixture: true,
  },
  {
    slug: "debatnyi-klub",
    title: "Дебатний клуб НаУКМА",
    summary:
      "Спільнота для тих, хто любить аргументувати. Тренуємо риторику й критичне мислення у форматі дебатів.",
    body: "## Дебатний клуб\n\nЩотижневі дебати на актуальні теми. Формати — від парламентських до British Parliamentary.\n\n**Для кого:** новачки й досвідчені.\n\nПриєднуйся — перший раунд завжди тренувальний.",
    category: "COMMUNITY",
    campus: NAUKMA,
    tags: [{ slug: "naukma", label: "НаУКМА" }],
    author: AUTHOR,
    votes: 0,
    comments: 0,
    participants: 0,
    createdAt: "2026-09-09T12:00:00.000Z",
  },
  {
    slug: "mafia-piatnytsi",
    title: "Мафія по п'ятницях у КМЦ",
    summary:
      "Щотижнева гра в мафію для студентів і друзів Могилянки. Приходь сам або з компанією — ведучий і ролі забезпечені.",
    body: "## Мафія по п'ятницях\n\nКласична психологічна гра: місто проти мафії. Новачкам усе пояснюємо на старті.\n\n- **Коли:** щоп'ятниці ввечері\n- **Де:** КМЦ (4-й корпус)\n- **Що взяти:** гарний настрій\n\nЗаходь у команду — і побачимося за столом.",
    category: "EVENT",
    campus: NAUKMA,
    tags: [
      { slug: "mafia", label: "Мафія" },
      { slug: "naukma", label: "НаУКМА" },
    ],
    author: AUTHOR,
    votes: 0,
    comments: 0,
    participants: 0,
    createdAt: "2026-09-25T12:00:00.000Z",
    eventAt: "2026-10-02T16:00:00.000Z",
    eventLocation: "НаУКМА, КМЦ (4-й корпус)",
  },
  {
    slug: "lecturenotes-ai",
    title: "LectureNotes AI: конспекти з лекцій",
    summary: "Інструмент, що з аудіо лекції робить структурований конспект із ключовими тезами й термінами.",
    body: "## LectureNotes AI\n\nЗаписав лекцію — отримав чистий конспект зі структурою й глосарієм.\n\n**MVP:** транскрипція + підсумок + експорт.\n\nШукаємо ML-ентузіастів і продуктового дизайнера. Можемо стартувати на найближчому хакатоні.",
    category: "STARTUP",
    campus: null,
    tags: [
      { slug: "startup", label: "Стартап" },
      { slug: "hakaton", label: "Хакатон" },
    ],
    author: AUTHOR,
    votes: 0,
    comments: 0,
    participants: 0,
    createdAt: "2026-09-20T12:00:00.000Z",
    needsRoles: "ML, Backend, Design",
  },
  {
    slug: "volonterska-initsiatyva",
    title: "Волонтерська ініціатива: збори для шпиталів",
    summary: "Регулярна ініціатива зі збору та плетіння необхідного для військових шпиталів. Долучитися може кожен.",
    body: "## Волонтерська ініціатива\n\nЗбираємося регулярно, щоб робити конкретну справу для шпиталів.\n\n**Як допомогти:** руками, коштом або поширенням.",
    category: "COMMUNITY",
    campus: null,
    tags: [{ slug: "volonterstvo", label: "Волонтерство" }],
    author: AUTHOR,
    votes: 0,
    comments: 0,
    participants: 0,
    createdAt: "2026-09-22T12:00:00.000Z",
  },
];

const EXTRA_TITLES = [
  "Нічний кіноклуб на даху шостого",
  "Лабораторія відкритих конспектів",
  "Сніданки для тих, хто пише диплом",
  "Майстерня плакатів до посвяти",
  "Радіогурток: ефір раз на тиждень",
  "Обмін книжками без черги в бібліотеці",
  "Польова кухня для волонтерських зборів",
  "Шаховий блискавичний турнір корпусів",
  "Студія короткого документального кіно",
  "Карта тихих місць для навчання",
  "Клуб вечірніх пробіжок навколо кампусу",
  "Майстерня ремонту ноутбуків для першого курсу",
  "Хор, який співає між парами",
  "Ярмарок студентських мікропослуг",
  "Ніч настільних ігор перед сесією",
  "Гурток польових записів міських звуків",
  "Спільна теплиця на подвір'ї гуртожитку",
  "Лекція-прогулянка старим Подолом",
  "Бюро перекладу оголошень кампусу",
  "Клуб листа до незнайомого однокурсника",
  "Майстерня першого пітчу без слайдів",
  "Архів фотографій посвяти за десять років",
  "Зустріч редакторів стінгазет",
  "Нічний пункт збору теплих речей",
  "Клуб повільного читання одного розділу",
  "Майстерня афіш для чужих подій",
  "Радіоперерва: п'ять пісень і одна розмова",
  "Пошук команди на хакатон вихідного дня",
  "Спільний сніданок після нічної зміни в бібліотеці",
  "Клуб суперечок без переможця",
  "Майстерня простого сайту для ініціативи",
  "Прогулянка дахами, яких уже немає",
  "Збір історій першого тижня в академії",
  "Клуб чужих плейлистів на одну добу",
  "Майстерня питань до викладача",
  "Ніч відкритих кухонь у гуртожитку",
  "Карта, де можна поговорити не пошепки",
  "Клуб одного завдання на тиждень",
  "Майстерня короткого листа партнеру",
  "Спільне прибирання аудиторії перед іспитом",
  "Клуб тиші на сорок хвилин",
  "Майстерня назви, яку не соромно сказати вголос",
  "Зустріч тих, хто шукає співведучого",
  "Клуб чорнового тексту без редактора",
  "Майстерня розкладу, який не ламає сон",
  "Прощання з семестром біля старого дуба",
];

const EXTRA_SUMMARIES = [
  "Коротко: збираємось, домовляємось про час і робимо одну конкретну річ.",
  "Шукаємо людей, яким це теж потрібно, а не ще одну розмову в чаті.",
  "Формат простий. Приходиш, береш роль, лишаєшся на один вечір або на семестр.",
  "Це чорнова ідея. Якщо відгукнеться, зберемо першу зустріч і подивимось, чи тримається.",
];

const EXTRA_BODIES = [
  "Починаємо без програми на десять слайдів. Перша зустріч потрібна, щоб побачити, хто взагалі прийде і яке в кого питання. Далі лишаємо лише те, що люди готові робити руками: час, місце, одна роль. Якщо після другої зустрічі лишається четверо, ідея жива.",
  "Тут немає набору в команду заради рядка в резюме. Потрібні ті, хто може прийти цього місяця. Напишемо, де стоїмо, скільки нас є і чого бракує. Решта деталей з'явиться в розмові під цією ідеєю, а не в окремому чаті, який потім ніхто не знайде.",
  "Хочеться, щоб це можна було прочитати за хвилину і зрозуміти, чи тобі сюди. Тому без обіцянок змінити кампус. Одна дія, один вечір, зрозумілий поріг входу. Якщо зайде, повторимо. Якщо ні, закриємо і не триматимемо порожню сторінку.",
];

function extraIdeas(): Idea[] {
  const categories: IdeaCategory[] = ["STARTUP", "PROJECT", "EVENT", "COMMUNITY", "OTHER"];
  const tagPool: IdeaTag[] = [
    { slug: "naukma", label: "НаУКМА" },
    { slug: "startup", label: "Стартап" },
    { slug: "hakaton", label: "Хакатон" },
    { slug: "volonterstvo", label: "Волонтерство" },
  ];
  const ideas: Idea[] = [];
  for (let i = 0; i < EXTRA_TITLES.length; i++) {
    const category = categories[i % categories.length];
    const campus = i % 2 === 0 ? NAUKMA : null;
    const created = new Date(Date.UTC(2026, 8, 26 - (i % 20), 12, 0, 0));
    const eventAt = category === "EVENT" ? new Date(Date.UTC(2026, 9, 3 + (i % 12), 16, 0, 0)).toISOString() : undefined;
    ideas.push({
      slug: `zrazok-${i + 1}`,
      title: EXTRA_TITLES[i],
      summary: EXTRA_SUMMARIES[i % EXTRA_SUMMARIES.length],
      body: EXTRA_BODIES[i % EXTRA_BODIES.length],
      category,
      campus,
      tags: [tagPool[i % tagPool.length]],
      author: AUTHOR,
      votes: i % 7,
      comments: i % 4,
      participants: i % 5,
      createdAt: created.toISOString(),
      eventAt,
      eventLocation: eventAt ? "НаУКМА" : undefined,
      fixture: true,
    });
  }
  return ideas;
}

/**
 * Тестові картки (переповнення, щільна стрічка) потрібні верстці, але не пошуку.
 * `IDEAS_SEED=true|false` керує явно; без змінної вони є лише в `react-router dev`.
 * Той самий прапорець читають лоадери і `prerender`, тож список сторінок і дані не розходяться.
 */
export function ideasSeedEnabled(): boolean {
  const flag = process.env.IDEAS_SEED;
  if (flag) return flag === "true";
  return process.env.NODE_ENV === "development";
}

export const IDEA_TITLE_MAX = 72;
export const IDEA_SUMMARY_MAX = 140;
const IDEA_TOKEN_MAX = 18;
const IDEA_TAG_MAX = 16;
const IDEA_PLACE_MAX = 32;
const IDEA_STORY_MAX = 280;

function limitText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const broken = clean
    .split(" ")
    .map((word) => (word.length <= IDEA_TOKEN_MAX ? word : word.slice(0, IDEA_TOKEN_MAX)))
    .join(" ");
  return broken.length <= max ? broken : broken.slice(0, max).trimEnd();
}

function limitIdea(idea: Idea): Idea {
  return {
    ...idea,
    title: limitText(idea.title, IDEA_TITLE_MAX),
    summary: limitText(idea.summary, IDEA_SUMMARY_MAX),
    eventLocation: idea.eventLocation ? limitText(idea.eventLocation, IDEA_PLACE_MAX) : undefined,
    tags: idea.tags.slice(0, 2).map((tag) => ({ ...tag, label: limitText(tag.label, IDEA_TAG_MAX) })),
  };
}

function ideaStory(idea: Idea): string {
  const plain = idea.body.replace(/[#*_>`[\]]/g, " ").replace(/\s+/g, " ").trim();
  const source = plain.length > idea.summary.length ? plain : idea.summary;
  return limitText(source, IDEA_STORY_MAX);
}

export function getIdeas(): Idea[] {
  const all = ideasSeedEnabled() ? [...IDEAS, ...extraIdeas()] : IDEAS.filter((idea) => !idea.fixture);
  return all.map(limitIdea);
}

export function getIdea(slug: string): Idea | null {
  return getIdeas().find((idea) => idea.slug === slug) ?? null;
}

export function toCard(idea: Idea): IdeaCard {
  const { body: _body, ...rest } = idea;
  return { ...rest, story: ideaStory(idea) };
}

export function toView(idea: Idea): IdeaView {
  const { body, ...rest } = idea;
  return { ...rest, html: renderMarkdown(body) };
}
