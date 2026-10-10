import { useEffect, useState, useRef } from "react";
import { data, Link, redirect, useFetcher, useRouteLoaderData } from "react-router";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "motion/react";
import { seo } from "~/lib/seo";
import type { Route } from "./+types/ideas.new";
import { Nav } from "~/components/landing/nav";
import { SiteFooter } from "~/components/ui/site-footer";
import { IdeasBackground } from "~/components/ideas/ideas-background";
import { Button } from "~/components/ui/button";
import { CATEGORY_LABELS, type IdeaCategory } from "~/lib/ideas";
import { ApiError, createIdea, getCurrentUser, routeApi } from "~/lib/api.server";
import type { IdeaCreate } from "~/lib/api-types";
import type { RootData } from "~/root";
import {
  IconSpark,
  IconLayers,
  IconCalendar,
  IconUsers,
  IconDots,
  IconPenLine,
  IconEyeOff,
  IconClose,
  IconPlus,
} from "~/components/landing/icons";

const CATEGORY_ICONS: Record<IdeaCategory, any> = {
  STARTUP: IconSpark,
  PROJECT: IconLayers,
  EVENT: IconCalendar,
  COMMUNITY: IconUsers,
  VOLUNTEERING: IconUsers,
  OTHER: IconDots,
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as IdeaCategory[];

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  try {
    const payload = JSON.parse(String(form.get("payload") ?? "{}")) as IdeaCreate;
    const idea = await createIdea(request, payload);
    return redirect(`/ideas/${idea.slug}`);
  } catch (error) {
    if (error instanceof ApiError) return data(error.body, { status: error.status });
    return data({ error: "Некоректні дані форми" }, { status: 400 });
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const user = await routeApi(getCurrentUser(request));
  if (!user) throw redirect("/login");
  return { user };
}

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } }
};

const stepVariants: Variants = {
  hidden: { opacity: 0, x: -10, filter: "blur(4px)" },
  visible: { 
    opacity: 1, x: 0, filter: "blur(0px)",
    // Залишений blur(0px) створює контекст накладання, і список ролей ховається під липкою мобільною панеллю дій.
    transitionEnd: { filter: "none" },
    transition: { duration: 0.28, ease: EASE_OUT, staggerChildren: 0.04 } 
  },
  exit: { opacity: 0, x: 10, filter: "blur(4px)", transition: { duration: 0.18, ease: EASE_OUT } }
};

/** Ліміти з backend/internal/ideas/domain/idea.go: поле показує їх одразу, а не після 422. */
const MAX_TAGS = 5;
const MAX_ROLES = 10;
const LABEL_MAX = 40;

const AVAILABLE_ROLES = ["Дизайнер", "Frontend-розробник", "Backend-розробник", "Fullstack-розробник", "Маркетолог", "Менеджер", "Ментор", "Тестувальник", "Копірайтер"];

const FIELD_SHELL =
  "flex flex-wrap items-center gap-1.5 rounded-xl border bg-[var(--color-bg)] p-1.5 transition-[border-color,box-shadow] duration-200 focus-within:border-[var(--color-accent)] focus-within:shadow-[0_0_12px_rgb(255_99_99/0.3)]";

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function meta(_args: Route.MetaArgs) {
  return seo({
    title: "Запропонувати ідею",
    description: "Опублікуй стартап, проєкт, подію чи клуб на Fantasm.",
    path: "/ideas/new",
  });
}

export default function IdeaNewPage() {
  const root = useRouteLoaderData<RootData>("root");
  const fetcher = useFetcher<{ error?: string; fields?: Record<string, string> }>();
  const [step, setStep] = useState(1);
  const [shakeStep, setShakeStep] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState({
    title: "",
    summary: "",
    category: null as IdeaCategory | null,
    eventAt: "",
    eventLocation: "",
    body: "",
    tags: [] as string[],
    needsRoles: [] as string[],
    visibility: "PUBLIC" as "PUBLIC" | "MEMBERS_ONLY",
  });

  const update = (patch: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  const nextStep = () => {
    if (step === 1 && !isStep1Valid) {
      setShakeStep(1); setTimeout(() => setShakeStep(null), 300); return;
    }
    if (step === 2 && !isStep2Valid) {
      setShakeStep(2); setTimeout(() => setShakeStep(null), 300); return;
    }
    setStep((s) => {
      const next = Math.min(s + 1, 3);
      if (next !== s) {
        setTimeout(() => {
          containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      }
      return next;
    });
  };
  const prevStep = () => setStep((s) => Math.max(s - 1, 1));

  const isStep1Valid = !!(formData.title.trim() && formData.summary.trim() && formData.category && (formData.category !== "EVENT" || (formData.eventAt && formData.eventLocation.trim())));
  const isStep2Valid = formData.body.trim().length > 5;

  const steps = ["Суть", "Деталі", "Публікація"];

  function publish() {
    if (!root?.currentUser) {
      window.location.assign("/login");
      return;
    }
    const payload: IdeaCreate = {
      ...formData,
      category: formData.category!,
      status: "OPEN",
      eventAt: formData.eventAt ? new Date(formData.eventAt).toISOString() : undefined,
      eventLocation: formData.eventLocation || undefined,
    };
    fetcher.submit({ payload: JSON.stringify(payload) }, { method: "post" });
  }

  return (
    <div className="flex flex-col bg-[var(--color-bg)]">
      <div className="flex min-h-dvh flex-col">
        <IdeasBackground interactive={false} />
        <Nav forceSolid />

        <motion.main
          ref={containerRef}
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
          className="relative z-10 mx-auto w-full flex-1 max-w-[72rem] px-5 pt-24 pb-16 sm:px-8"
        >
        <motion.div variants={itemVariants} className="mb-8">
          <nav aria-label="Хлібні крихти" className="hud-label flex min-w-0 flex-wrap items-center gap-x-2 text-[var(--color-text-muted)]">
            <Link to="/" prefetch="intent" className="transition-colors hover:text-[var(--color-text)]">Головна</Link>
            <span aria-hidden="true">/</span>
            <Link to="/ideas" prefetch="intent" className="transition-colors hover:text-[var(--color-text)]">Ідеї</Link>
            <span aria-hidden="true">/</span>
            <span className="truncate">Нова ідея</span>
          </nav>
        </motion.div>

        <div className="grid gap-12 lg:grid-cols-[60%_1fr]">

            {/* Left Column: Form */}
            <div className="flex flex-col pt-4">

              {/* Stepper */}
              <motion.div variants={itemVariants} className="mb-10 flex items-center gap-1 select-none overflow-x-auto no-scrollbar -ml-3 py-2 -my-2">
                {steps.map((s, i) => {
                  const isActive = step === i + 1;
                  const isPast = step > i + 1;
                  return (
                    <div key={s} className="flex items-center gap-1">
                      <div className="relative px-3 py-1.5">
                        {isActive && (
                          <motion.div
                            layoutId="stepper-indicator"
                            className="absolute inset-0 rounded-full bg-[var(--color-border-strong)]/40"
                            transition={{ type: "spring", duration: 0.5, bounce: 0 }}
                          />
                        )}
                        <span
                          className={`relative z-10 text-sm font-medium transition-colors duration-300 ${
                            isActive || isPast ? "text-[var(--color-text)]" : "text-[var(--color-text-faint)]"
                          }`}
                        >
                          <span className="opacity-50 mr-1">0{i + 1}</span> {s}
                        </span>
                      </div>
                      {i < steps.length - 1 && (
                        <span className="text-[var(--color-text-faint)] opacity-30 px-1">—</span>
                      )}
                    </div>
                  );
                })}
              </motion.div>

              <motion.h1 variants={itemVariants} className="headline mt-2 mb-10 text-[var(--color-text)]">
                Запропонувати ідею
              </motion.h1>

              <motion.div variants={itemVariants} className="relative">
                <AnimatePresence mode="popLayout" initial={false}>
                  {step === 1 && (
                    <motion.div
                      key="step1"
                      initial="hidden"
                      animate={shakeStep === 1 ? "shake" : "visible"}
                      exit="exit"
                      variants={{
                        ...stepVariants,
                        shake: { ...stepVariants.visible, x: [-8, 8, -8, 8, 0], transition: { duration: 0.3 } }
                      }}
                      className="flex flex-col gap-7"
                    >
                      <motion.div variants={itemVariants} className="flex flex-col gap-2.5">
                        <label htmlFor="title" className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                          Як назвемо ідею?
                        </label>
                        <input
                          id="title"
                          type="text"
                          required
                          placeholder="Наприклад: Хакатон з ШІ для студентів"
                          value={formData.title}
                          onChange={(e) => update({ title: e.target.value })}
                          className={`block w-full rounded-xl border ${shakeStep === 1 && !formData.title.trim() ? "border-red-500" : "border-[var(--color-border)]"} bg-[var(--color-bg)] px-3 py-2 text-[16px] sm:text-sm text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgb(255_99_99/0.3)] input-focus-pulse focus:outline-none`}
                        />
                      </motion.div>

                      <motion.div variants={itemVariants} className="flex flex-col gap-2.5">
                        <label htmlFor="summary" className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                          Суть в одному реченні
                        </label>
                        <textarea
                          id="summary"
                          required
                          rows={2}
                          placeholder="Це побачать у стрічці. Зачепіть увагу."
                          value={formData.summary}
                          onChange={(e) => update({ summary: e.target.value })}
                          className={`block w-full resize-none rounded-xl border ${shakeStep === 1 && !formData.summary.trim() ? "border-red-500" : "border-[var(--color-border)]"} bg-[var(--color-bg)] px-3 py-2 text-[16px] sm:text-sm text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgb(255_99_99/0.3)] input-focus-pulse focus:outline-none`}
                        />
                      </motion.div>

                      <motion.div variants={itemVariants} className="flex flex-col gap-2.5">
                        <span id="format-label" className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                          Формат ідеї
                        </span>
                        <FormatPicker
                          value={formData.category}
                          invalid={shakeStep === 1 && !formData.category}
                          onChange={(category) => update({ category })}
                        />
                      </motion.div>

                      <AnimatePresence>
                        {formData.category === "EVENT" && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: EASE_OUT }}
                            className="flex flex-col gap-4 overflow-hidden pt-2"
                          >
                            <div className="flex flex-col gap-2.5">
                              <label className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                                Коли відбудеться?
                              </label>
                              <input
                                type="datetime-local"
                                required
                                value={formData.eventAt}
                                onChange={(e) => update({ eventAt: e.target.value })}
                                className={`block w-full [color-scheme:dark] rounded-xl border ${shakeStep === 1 && !formData.eventAt ? "border-red-500" : "border-[var(--color-border)]"} bg-[var(--color-bg)] px-3 py-2 text-[16px] sm:text-sm text-[var(--color-text)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgb(255_99_99/0.3)] input-focus-pulse focus:outline-none`}
                              />
                            </div>
                            <div className="flex flex-col gap-2.5">
                              <label className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                                Де саме?
                              </label>
                              <input
                                type="text"
                                required
                                placeholder="Аудиторія, локація або посилання на зустріч"
                                value={formData.eventLocation}
                                onChange={(e) => update({ eventLocation: e.target.value })}
                                className={`block w-full rounded-xl border ${shakeStep === 1 && !formData.eventLocation.trim() ? "border-red-500" : "border-[var(--color-border)]"} bg-[var(--color-bg)] px-3 py-2 text-[16px] sm:text-sm text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgb(255_99_99/0.3)] input-focus-pulse focus:outline-none`}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}

                  {step === 2 && (
                    <motion.div
                      key="step2"
                      initial="hidden"
                      animate={shakeStep === 2 ? "shake" : "visible"}
                      exit="exit"
                      variants={{
                        ...stepVariants,
                        shake: { ...stepVariants.visible, x: [-8, 8, -8, 8, 0], transition: { duration: 0.3 } }
                      }}
                      className="flex flex-col gap-7"
                    >
                      <motion.div variants={itemVariants} className="flex flex-col gap-2.5">
                        <label className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                          Усі деталі
                        </label>
                          <textarea
                            rows={6}
                            required
                            placeholder="Розкажіть деталі: що це, для кого, і хто вам потрібен..."
                            value={formData.body}
                            onChange={(e) => update({ body: e.target.value })}
                            className={`block w-full resize-y min-h-[120px] max-h-[60vh] rounded-xl border ${shakeStep === 2 && formData.body.trim().length <= 5 ? "border-red-500" : "border-[var(--color-border)]"} bg-[var(--color-bg)] px-3 py-2 text-[16px] sm:text-sm text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgb(255_99_99/0.3)] input-focus-pulse focus:outline-none`}
                          />
                      </motion.div>

                      {formData.category !== "EVENT" && formData.category !== null && (
                        <motion.div variants={itemVariants} className="flex flex-col gap-2.5">
                          <label htmlFor="roles" className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                            Кого шукаєте в команду?
                          </label>
                          <RolePicker
                            roles={formData.needsRoles}
                            onChange={(needsRoles) => update({ needsRoles })}
                          />
                        </motion.div>
                      )}

                      <motion.div variants={itemVariants} className="flex flex-col gap-2.5">
                        <label htmlFor="tags" className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                          Теги (не обов'язково)
                        </label>
                        <TagInput tags={formData.tags} onChange={(tags) => update({ tags })} />
                      </motion.div>
                    </motion.div>
                  )}

                  {step === 3 && (
                    <motion.div
                      key="step3"
                      initial="hidden"
                      animate="visible"
                      exit="exit"
                      variants={stepVariants}
                      className="flex flex-col gap-7"
                    >
                      <motion.div variants={itemVariants} className="flex flex-col gap-2.5">
                        <span className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                          Хто зможе це побачити?
                        </span>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => update({ visibility: "PUBLIC" })}
                            className={`group select-none flex flex-col items-start gap-2 rounded-[20px] border p-5 text-left transition-all active:scale-[0.98] ${formData.visibility === "PUBLIC"
                                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[0_0_24px_rgba(255,99,99,0.1)]"
                                : "border-[var(--color-border-strong)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]"
                              }`}
                          >
                            <div className={`flex items-center gap-2 transition-colors ${formData.visibility === "PUBLIC" ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}>
                              <IconUsers className="size-5" />
                              <span className="font-medium text-base">Публічна</span>
                            </div>
                            <span className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                              Ідею побачать усі відвідувачі платформи. Вона індексуватиметься пошуковиками.
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => update({ visibility: "MEMBERS_ONLY" })}
                            className={`group select-none flex flex-col items-start gap-2 rounded-[20px] border p-5 text-left transition-all active:scale-[0.98] ${formData.visibility === "MEMBERS_ONLY"
                                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[0_0_24px_rgba(255,99,99,0.1)]"
                                : "border-[var(--color-border-strong)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]"
                              }`}
                          >
                            <div className={`flex items-center gap-2 transition-colors ${formData.visibility === "MEMBERS_ONLY" ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}>
                              <IconEyeOff className="size-5" />
                              <span className="font-medium text-base">Лише для НаУКМА</span>
                            </div>
                            <span className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                              Приховано від зовнішніх. Ідею побачать лише верифіковані могилянці.
                            </span>
                          </button>
                        </div>
                      </motion.div>

                      {/* Mobile Only Preview */}
                      <motion.div variants={itemVariants} className="block lg:hidden mt-6">
                        <div className="mb-4 pb-2 border-b border-[var(--color-border-strong)]">
                          <p className="font-medium text-sm text-[var(--color-text-faint)] select-none">
                            Прев'ю в стрічці
                          </p>
                        </div>
                        <div className="relative z-10 pointer-events-none">
                          <IdeaPreviewCard data={formData} />
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              <motion.div variants={itemVariants} className="sticky bottom-0 z-30 mt-12 flex items-center justify-between border-t border-[var(--color-border-strong)] bg-[var(--color-bg)]/90 backdrop-blur-md pt-4 pb-8 px-1 -mx-1 sm:static sm:bg-transparent sm:backdrop-blur-none sm:pb-0 sm:px-0 sm:mx-0 sm:pt-6">
                {step > 1 ? (
                  <Button variant="secondary" onClick={prevStep} className="active:scale-[0.97] transition-transform">
                    Назад
                  </Button>
                ) : (
                  <div />
                )}
                {step < 3 ? (
                  <Button
                    onClick={nextStep}
                    arrow
                    className="transition-all active:scale-[0.97]"
                  >
                    Далі
                  </Button>
                ) : (
                  <Button
                    arrow
                    onClick={publish}
                    disabled={fetcher.state !== "idle"}
                    className="active:scale-[0.97] transition-transform shadow-[0_0_20px_rgba(255,99,99,0.3)] hover:shadow-[0_0_30px_rgba(255,99,99,0.4)]"
                  >
                    {fetcher.state === "idle" ? "Опублікувати" : "Публікуємо…"}
                  </Button>
                )}
              </motion.div>
              {fetcher.data?.error ? <p role="alert" className="mt-3 text-sm text-red-300">{fetcher.data.error}</p> : null}
            </div>

            {/* Right Column: Live Preview */}
            <motion.div variants={itemVariants} className="hidden lg:block relative">
              <div className="sticky top-24 pt-2">
                <div className="mb-4 pb-2 backdrop-blur-xl bg-[var(--color-bg)]/80 sticky top-0 z-20">
                  <p className="font-medium text-sm text-[var(--color-text-faint)] select-none">
                    Прев'ю в стрічці
                  </p>
                </div>

                <div className="relative z-10">
                  <IdeaPreviewCard data={formData} />
                </div>
              </div>
            </motion.div>

          </div>
        </motion.main>
      </div>

      <div className="relative z-10">
        <SiteFooter />
      </div>
    </div>
  );
}

/** Усі формати видно завжди, тож вибір не змінює висоту форми: рухається лише підсвітка. */
function FormatPicker({
  value,
  invalid,
  onChange,
}: {
  value: IdeaCategory | null;
  invalid: boolean;
  onChange: (category: IdeaCategory) => void;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      role="radiogroup"
      aria-labelledby="format-label"
      className={`grid grid-cols-2 gap-1 rounded-2xl border bg-[var(--color-surface)] p-1 transition-[border-color] duration-200 sm:grid-cols-3 ${
        invalid ? "border-red-500" : "border-[var(--color-border)]"
      }`}
    >
      {CATEGORIES.map((cat) => {
        const Icon = CATEGORY_ICONS[cat];
        const selected = value === cat;
        return (
          <button
            key={cat}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(cat)}
            className={`group relative flex select-none items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
              selected
                ? "text-[var(--color-accent)]"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text)]"
            }`}
          >
            {selected && (
              <motion.span
                layoutId="format-highlight"
                aria-hidden="true"
                style={{ borderRadius: 12 }}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }}
                className="absolute inset-0 border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10"
              />
            )}
            <Icon
              className={`relative size-4 shrink-0 transition-colors duration-200 ${
                selected ? "" : "text-[var(--color-text-faint)] group-hover:text-[var(--color-text)]"
              }`}
            />
            <span className="relative">{CATEGORY_LABELS[cat]}</span>
          </button>
        );
      })}
    </div>
  );
}

function chipMotion(reduceMotion: boolean | null) {
  return reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { opacity: 0, transform: "scale(0.95)" },
        animate: { opacity: 1, transform: "scale(1)" },
        exit: { opacity: 0, transform: "scale(0.95)" },
        transition: { duration: 0.15, ease: EASE_OUT },
      };
}

function RemoveChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={`Прибрати ${label}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="grid size-5 place-items-center rounded-full transition-colors duration-150 hover:bg-[var(--color-border-strong)]"
    >
      <IconClose className="size-3" />
    </button>
  );
}

/**
 * Комбобокс ролей: вибрані ролі чипами в полі, підказки у випадаючому списку поверх
 * сусідніх полів, тож відкриття не зсуває форму.
 */
function RolePicker({ roles, onChange }: { roles: string[]; onChange: (roles: string[]) => void }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();

  const q = query.trim();
  const full = roles.length >= MAX_ROLES;
  const taken = q !== "" && roles.some((role) => sameLabel(role, q));
  const suggestions = full
    ? []
    : AVAILABLE_ROLES.filter((role) => !roles.includes(role) && role.toLowerCase().includes(q.toLowerCase()));
  const canCreate = !full && q !== "" && !taken && !AVAILABLE_ROLES.some((role) => sameLabel(role, q));
  const options = canCreate ? [...suggestions, q] : suggestions;
  const current = Math.min(active, Math.max(options.length - 1, 0));

  useEffect(() => {
    if (open) document.getElementById(`role-option-${current}`)?.scrollIntoView({ block: "nearest" });
  }, [current, open]);

  function add(role: string) {
    const label = role.trim().slice(0, LABEL_MAX);
    if (!label || full || roles.some((r) => sameLabel(r, label))) return;
    onChange([...roles, label]);
    setQuery("");
    setActive(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (options.length) setActive((current + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && options.length) add(options[current]);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !query && roles.length) {
      onChange(roles.slice(0, -1));
    }
  }

  const popover = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, transform: "translateY(-4px) scale(0.98)" },
        animate: { opacity: 1, transform: "translateY(0px) scale(1)" },
        exit: { opacity: 0, transform: "translateY(-4px) scale(0.98)" },
      };

  return (
    <div className={open ? "relative z-40" : "relative"}>
      <div
        onClick={() => {
          inputRef.current?.focus();
          setOpen(true);
        }}
        className={`${FIELD_SHELL} relative cursor-text border-[var(--color-border)]`}
      >
        <IconUsers className="ml-1.5 size-4 shrink-0 text-[var(--color-text-faint)]" />
        <AnimatePresence mode="popLayout" initial={false}>
          {roles.map((role) => (
            <motion.span
              key={role}
              {...chipMotion(reduceMotion)}
              className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 py-1 pr-1 pl-2.5 text-sm text-[var(--color-accent)]"
            >
              {role}
              <RemoveChip label={role} onClick={() => onChange(roles.filter((r) => r !== role))} />
            </motion.span>
          ))}
        </AnimatePresence>
        <input
          ref={inputRef}
          id="roles"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="role-options"
          aria-autocomplete="list"
          aria-activedescendant={open && options.length ? `role-option-${current}` : undefined}
          autoComplete="off"
          maxLength={LABEL_MAX}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          placeholder={roles.length ? "Ще роль…" : "Оберіть зі списку або впишіть свою"}
          className="min-w-[8rem] flex-1 bg-transparent px-1.5 py-1 text-[16px] text-[var(--color-text)] placeholder-[var(--color-text-faint)] outline-none sm:text-sm"
        />
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="role-options"
            {...popover}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            style={{ transformOrigin: "top center" }}
            onMouseDown={(e) => e.preventDefault()}
            className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-xl"
          >
            <ul id="role-options" role="listbox" aria-label="Ролі" className="no-scrollbar max-h-60 overflow-y-auto p-1">
              {options.map((option, index) => {
                const isCreate = canCreate && index === options.length - 1;
                return (
                  <li
                    key={isCreate ? "__create" : option}
                    id={`role-option-${index}`}
                    role="option"
                    aria-selected={index === current}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => add(option)}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors duration-100 ${
                      index === current ? "bg-[var(--color-bg-subtle)]" : ""
                    } ${isCreate ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}
                  >
                    {isCreate ? (
                      <>
                        <IconPlus className="size-4" /> Додати «{option}»
                      </>
                    ) : (
                      option
                    )}
                  </li>
                );
              })}
              {options.length === 0 && (
                <li className="px-3 py-2.5 text-sm text-[var(--color-text-muted)]">
                  {full ? `Максимум ${MAX_ROLES} ролей` : taken ? "Цю роль уже додано" : "Усі ролі зі списку вже додано, впишіть свою"}
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Тег стає чипом після Enter, коми, пробілу або виходу з поля; поки він не доданий,
 * чернетка підсвічена акцентним «#», а поруч є кнопка «Додати».
 */
function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const full = tags.length >= MAX_TAGS;

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 700);
    return () => clearTimeout(timer);
  }, [flash]);

  function commit(raw: string[]) {
    let next = tags;
    let message: string | null = null;
    for (const part of raw) {
      const label = part.trim().replace(/^#+/, "").trim();
      if (!label) continue;
      const existing = next.find((tag) => sameLabel(tag, label));
      if (existing) {
        setFlash(existing);
        message = `Тег #${existing} уже додано`;
      } else if (next.length >= MAX_TAGS) {
        message = `Максимум ${MAX_TAGS} тегів`;
      } else if (label.length > LABEL_MAX) {
        message = `Тег до ${LABEL_MAX} символів`;
      } else {
        next = [...next, label];
      }
    }
    if (next !== tags) onChange(next);
    setNotice(message);
  }

  function onInput(value: string) {
    if (/[,\s]/.test(value)) {
      const parts = value.split(/[,\s]+/);
      const rest = parts.pop() ?? "";
      commit(parts);
      setDraft(rest);
    } else {
      setDraft(value);
      if (notice) setNotice(null);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit([draft]);
      setDraft("");
    } else if (e.key === "Backspace" && !draft && tags.length) {
      onChange(tags.slice(0, -1));
      setNotice(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        onClick={() => inputRef.current?.focus()}
        className={`${FIELD_SHELL} relative cursor-text ${notice ? "border-[var(--color-accent)]/60" : "border-[var(--color-border)]"}`}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {tags.map((tag) => (
            <motion.span
              key={tag}
              {...chipMotion(reduceMotion)}
              className={`inline-flex items-center gap-0.5 rounded-[var(--radius-chip)] border py-1 pr-1 pl-2.5 text-sm transition-colors duration-200 ${
                flash === tag
                  ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "border-[var(--color-border-strong)] bg-[var(--color-surface-strong)] text-[var(--color-text)]"
              }`}
            >
              <span className="text-[var(--color-text-faint)]">#</span>
              {tag}
              <RemoveChip label={`#${tag}`} onClick={() => onChange(tags.filter((t) => t !== tag))} />
            </motion.span>
          ))}
        </AnimatePresence>
        <span className="flex min-w-[8rem] flex-1 items-center">
          <span
            aria-hidden="true"
            className={`pl-1.5 text-sm transition-colors duration-150 ${draft ? "text-[var(--color-accent)]" : "text-[var(--color-text-faint)]"}`}
          >
            #
          </span>
          <input
            ref={inputRef}
            id="tags"
            type="text"
            autoComplete="off"
            enterKeyHint="done"
            aria-describedby="tags-hint"
            maxLength={LABEL_MAX + 1}
            value={draft}
            onChange={(e) => onInput(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              commit([draft]);
              setDraft("");
            }}
            placeholder={full ? "Додано максимум тегів" : tags.length ? "Ще тег…" : "наприклад: хакатон"}
            className="min-w-0 flex-1 bg-transparent py-1 pr-1 pl-0.5 text-[16px] text-[var(--color-text)] placeholder-[var(--color-text-faint)] outline-none sm:text-sm"
          />
          {draft.trim() && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                commit([draft]);
                setDraft("");
              }}
              className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--color-border-strong)] px-2 py-1 text-xs font-medium text-[var(--color-text)] transition-colors duration-150 hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              Додати <kbd className="font-mono text-[var(--color-text-faint)]">↵</kbd>
            </button>
          )}
        </span>
      </div>
      <p id="tags-hint" aria-live="polite" className="flex justify-between gap-3 px-1 text-xs">
        <span className={notice ? "text-[var(--color-accent)]" : "text-[var(--color-text-faint)]"}>
          {notice ?? "Enter, кома або пробіл перетворюють текст на тег"}
        </span>
        <span className="shrink-0 tabular-nums text-[var(--color-text-faint)]">
          {tags.length}/{MAX_TAGS}
        </span>
      </p>
    </div>
  );
}

function IdeaPreviewCard({ data }: { data: any }) {
  const CatIcon = data.category ? CATEGORY_ICONS[data.category as IdeaCategory] : null;

  const cardVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const childVariants: Variants = {
    hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
    visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", bounce: 0, duration: 0.5 } }
  };

  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      className="group relative flex flex-col gap-3 border-y border-[var(--color-border-strong)] py-6"
    >
      <motion.div variants={childVariants} className="flex items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
          01
        </span>
        <div className="h-px flex-1 bg-[var(--color-border-strong)]" />
      </motion.div>

      <motion.div variants={childVariants} className="flex flex-col gap-1">
        <h3 className="text-[clamp(1.5rem,2.3vw,2.6rem)] font-medium uppercase leading-[1.08] tracking-[0.02em] text-[var(--color-text)] break-words transition-[color,filter,opacity] duration-500">
          {data.title ? (
            <span>{data.title}</span>
          ) : (
            <span className="opacity-30">НАЗВА ІДЕЇ</span>
          )}
        </h3>

        <div className="flex flex-wrap items-center gap-2 mt-2">
          {data.category && (
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-[var(--color-border-strong)] px-2 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              {CatIcon && <CatIcon className="size-3" />}
              {CATEGORY_LABELS[data.category as IdeaCategory]}
            </span>
          )}
          {data.visibility === "MEMBERS_ONLY" && (
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-[var(--color-accent)] px-2 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-accent)]">
              <IconEyeOff className="size-3" />
              ТІЛЬКИ НАУКМА
            </span>
          )}
          {data.needsRoles.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-2 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-accent)]">
              <IconUsers className="size-3" />
              ШУКАЄ КОМАНДУ
            </span>
          )}
          {data.tags.slice(0, 3).map((tag: string, i: number) => (
             <span key={i} className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-[var(--color-border-strong)] px-2 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
               #{tag}
             </span>
          ))}
        </div>
      </motion.div>

      <motion.p variants={childVariants} className="mt-2 text-base text-[var(--color-text-muted)] line-clamp-2 break-words transition-[color,opacity] duration-500">
        {data.summary ? (
          <span>{data.summary}</span>
        ) : (
          <span className="opacity-30">Це місце для короткого опису. Він відображатиметься у стрічці та допоможе іншим швидко зрозуміти суть вашої ідеї.</span>
        )}
      </motion.p>

      {data.eventAt && data.category === "EVENT" && (
        <motion.div variants={childVariants} className="mt-2 flex items-center gap-2 text-sm text-[var(--color-text-faint)]">
          <IconCalendar className="size-4" />
          <span>{new Date(data.eventAt).toLocaleString("uk-UA")}</span>
          {data.eventLocation && (
            <>
              <span className="w-1 h-1 rounded-full bg-[var(--color-border-strong)]" />
              <span>{data.eventLocation}</span>
            </>
          )}
        </motion.div>
      )}

      <motion.div variants={childVariants} className="mt-4 flex items-center gap-4">
        <div className="flex items-center gap-1 text-[var(--color-text-muted)]">
          <IconPenLine className="size-4" />
          <span className="text-sm font-medium">0</span>
        </div>
      </motion.div>

      <div className="absolute left-0 -top-px h-[1.5px] w-0 bg-white transition-[width] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:w-full z-10" />
      <div className="absolute left-0 -bottom-px h-px w-0 bg-white/30 transition-[width] duration-700 ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:w-full z-10" />
    </motion.div>
  );
}
