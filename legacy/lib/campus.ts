/**
 * NaUKMA campus buildings — editorial metadata for the interactive map.
 *
 * Geometry (footprints + badge positions) lives in the AUTO-GENERATED
 * `campus-geo.ts`, traced from the official NaUKMA library/campus scheme.
 * The two are joined by `num`.
 *
 * NOTE: `body`/`short` are editorial drafts based on the scheme's legend (which
 * libraries/services sit where). Verify specifics against official NaUKMA
 * sources before treating them as authoritative — assignments change.
 */
export interface Building {
  /** Stable id — Cover seed + photo filename (public/campus/<id>-800.webp). */
  id: string;
  /** Join key to CAMPUS_GEO (badge number on the scheme). */
  num: string;
  name: string;
  /** One line for the legend and the home teaser. */
  short: string;
  /** Paragraph shown in the detail sheet. */
  body: string;
  /** Optional real photo (set once optimised WebP exists in public/campus). */
  photo?: { src: string; w: number; h: number };
}

export const BUILDINGS: Building[] = [
  {
    id: "korpus-1",
    num: "1",
    name: "1-й корпус",
    short: "Навчальний корпус південного кластера",
    body: "Навчальний корпус НаУКМА у південній частині кампусу, поряд із циркульним (3-м) корпусом. У комплексі корпусів розміщені й бібліотечні простори, зокрема дослідницька бібліотека.",
  },
  {
    id: "korpus-2",
    num: "2",
    name: "2-й корпус",
    short: "Комплекс із бібліотекою Антоновичів і Музеєм НаУКМА",
    body: "Один із головних корпусів південного кластера. Тут (у бібліотечному комплексі) розташовані бакалаврська бібліотека Тетяни та Омеляна Антоновичів, Музей НаУКМА, а також філологічна й мистецька бібліотеки.",
  },
  {
    id: "korpus-3",
    num: "3",
    name: "3-й (циркульний) корпус",
    short: "Впізнаваний корпус дугоподібної форми",
    body: "Циркульний корпус НаУКМА характерної дугоподібної форми біля Контрактової площі — один із візуальних символів кампусу.",
  },
  {
    id: "korpus-4",
    num: "4",
    name: "4-й корпус",
    short: "Американська бібліотека ім. В. Китастого; поряд КМЦ",
    body: "Центральний навчальний корпус. Тут розміщена Американська бібліотека імені В. Китастого, а поряд — культурно-мистецький центр (КМЦ). У центральному комплексі також бібліотеки-архіви О. Пріцака та Дж. Мейса.",
  },
  {
    id: "korpus-5",
    num: "5",
    name: "5-й корпус",
    short: "Бібліотека Центру польських та європейських студій",
    body: "Навчальний корпус центрального ряду (7–6–5) уздовж вул. Волоської. Тут розташована бібліотека Центру польських та європейських студій.",
  },
  {
    id: "korpus-6",
    num: "6",
    name: "6-й корпус",
    short: "Навчальний корпус центрального ряду",
    body: "Навчальний корпус НаУКМА центрального ряду вздовж вул. Волоської, між 7-м і 5-м.",
  },
  {
    id: "korpus-7",
    num: "7",
    name: "7-й корпус",
    short: "Навчальний корпус центрального ряду",
    body: "Навчальний корпус НаУКМА, що відкриває центральний ряд (7–6–5) уздовж вул. Волоської.",
  },
  {
    id: "korpus-8",
    num: "8",
    name: "8-й корпус",
    short: "Навчальний корпус північного кластера",
    body: "Навчальний корпус НаУКМА у північній частині кампусу, поряд із 9-м.",
  },
  {
    id: "korpus-9",
    num: "9",
    name: "9-й корпус",
    short: "Північний корпус; бібліотека НПЦД",
    body: "Навчальний корпус НаУКМА у північній частині кампусу. Тут розміщена бібліотека Наукового парку / НПЦД.",
  },
  {
    id: "korpus-10",
    num: "10",
    name: "10-й корпус",
    short: "Навчальний корпус південного кластера",
    body: "Навчальний корпус НаУКМА у південній частині кампусу, між центральним рядом і комплексом 1–2–3.",
  },
  {
    id: "kmc",
    num: "КМЦ",
    name: "Культурно-мистецький центр",
    short: "Простір для подій, виступів і мистецьких проєктів",
    body: "Культурно-мистецький центр НаУКМА — майданчик для концертів, лекцій, театральних показів і студентських заходів. Розташований у центральній частині кампусу поряд із 4-м корпусом.",
  },
];

/** Buildings featured as tiles on the home page. */
export const CAMPUS_HIGHLIGHTS = ["korpus-4", "korpus-2", "korpus-3"] as const;
