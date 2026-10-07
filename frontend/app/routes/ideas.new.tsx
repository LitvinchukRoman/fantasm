import { useState, useRef } from "react";
import { Link } from "react-router";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { seo } from "~/lib/seo";
import type { Route } from "./+types/ideas.new";
import { Nav } from "~/components/landing/nav";
import { SiteFooter } from "~/components/ui/site-footer";
import { IdeasBackground } from "~/components/ideas/ideas-background";
import { Button } from "~/components/ui/button";
import { CATEGORY_LABELS, type IdeaCategory } from "~/lib/ideas";
import {
  IconArrowRight,
  IconSpark,
  IconLayers,
  IconCalendar,
  IconUsers,
  IconDots,
  IconPenLine,
  IconCheck,
  IconEyeOff,
  IconClose,
} from "~/components/landing/icons";

const CATEGORY_ICONS: Record<IdeaCategory, any> = {
  STARTUP: IconSpark,
  PROJECT: IconLayers,
  EVENT: IconCalendar,
  COMMUNITY: IconUsers,
  OTHER: IconDots,
};

const CATEGORIES = Object.keys(CATEGORY_LABELS) as IdeaCategory[];

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } }
};

const stepVariants: Variants = {
  hidden: { opacity: 0, x: -10, filter: "blur(4px)" },
  visible: { 
    opacity: 1, x: 0, filter: "blur(0px)",
    transition: { duration: 0.4, ease: EASE_OUT, staggerChildren: 0.05 } 
  },
  exit: { opacity: 0, x: 10, filter: "blur(4px)", transition: { duration: 0.4, ease: EASE_OUT } }
};

export function meta(_args: Route.MetaArgs) {
  return seo({
    title: "Запропонувати ідею",
    description: "Опублікуй стартап, проєкт, подію чи клуб на Fantasm.",
    path: "/ideas/new",
  });
}

export default function IdeaNewPage() {
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
    visibility: "PUBLIC" as "PUBLIC" | "UKMA_ONLY",
  });

  const [tagInput, setTagInput] = useState("");
  const [roleInput, setRoleInput] = useState("");
  const [isRolePaletteOpen, setRolePaletteOpen] = useState(false);
  const [isFormatExpanded, setFormatExpanded] = useState(!formData.category);

  const AVAILABLE_ROLES = ["Дизайнер", "Frontend-розробник", "Backend-розробник", "Fullstack-розробник", "Маркетолог", "Менеджер", "Ментор", "Тестувальник", "Копірайтер"];
  const filteredRoles = AVAILABLE_ROLES.filter(r => r.toLowerCase().includes(roleInput.toLowerCase()) && !formData.needsRoles.includes(r));

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "," || e.key === " ") {
      e.preventDefault();
      const newTag = tagInput.trim().replace(/^#/, "");
      if (newTag && !formData.tags.includes(newTag)) {
        update({ tags: [...formData.tags, newTag] });
      }
      setTagInput("");
    } else if (e.key === "Backspace" && !tagInput && formData.tags.length > 0) {
      update({ tags: formData.tags.slice(0, -1) });
    }
  };
  const removeTag = (tag: string) => update({ tags: formData.tags.filter(t => t !== tag) });
  const removeRole = (role: string) => update({ needsRoles: formData.needsRoles.filter(r => r !== role) });

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

  const canProceed = step === 1 ? isStep1Valid : step === 2 ? isStep2Valid : true;
  const steps = ["Суть", "Деталі", "Публікація"];

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

              <motion.div variants={itemVariants} layout transition={{ type: "spring", duration: 0.5, bounce: 0 }} className="relative">
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
                          className={`block w-full rounded-xl border ${shakeStep === 1 && !formData.title.trim() ? "border-red-500" : "border-[var(--color-border)]"} bg-[var(--color-bg)] px-3 py-2 text-[16px] sm:text-sm text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-all duration-500 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgb(255_99_99/0.3)] input-focus-pulse focus:outline-none`}
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
                          className={`block w-full resize-none rounded-xl border ${shakeStep === 1 && !formData.summary.trim() ? "border-red-500" : "border-[var(--color-border)]"} bg-[var(--color-bg)] px-3 py-2 text-[16px] sm:text-sm text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-all duration-500 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgb(255_99_99/0.3)] input-focus-pulse focus:outline-none`}
                        />
                      </motion.div>

                      <motion.div variants={itemVariants} className="flex flex-col gap-2.5">
                        <span className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                          Формат ідеї
                        </span>
                        <motion.div layout transition={{ type: "spring", bounce: 0, duration: 0.6 }} className="relative flex items-center min-h-[52px]">
                          <AnimatePresence mode="popLayout">
                            {!isFormatExpanded ? (
                              <motion.button
                                key="collapsed"
                                layoutId="format-island"
                                style={{ borderRadius: 12 }}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ layout: { type: "spring", bounce: 0, duration: 0.6 }, opacity: { duration: 0.3 } }}
                                onClick={() => setFormatExpanded(true)}
                                className={`inline-flex items-center gap-2 border px-5 py-3 text-sm font-medium transition-colors hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)] ${
                                  formData.category 
                                    ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent-soft)]" 
                                    : "border-[var(--color-border)] text-[var(--color-text-muted)] bg-[var(--color-surface)] shadow-[0_0_12px_rgb(255_255_255/0.05)]"
                                } ${shakeStep === 1 && !formData.category ? "border-red-500" : ""}`}
                              >
                                {formData.category ? (
                                  <>
                                    {(() => {
                                      const Icon = CATEGORY_ICONS[formData.category as IdeaCategory];
                                      return <Icon className="size-4" />;
                                    })()}
                                    {CATEGORY_LABELS[formData.category as IdeaCategory]}
                                  </>
                                ) : (
                                  <>✨ Вибрати формат</>
                                )}
                              </motion.button>
                            ) : (
                              <motion.div
                                key="expanded"
                                layoutId="format-island"
                                style={{ borderRadius: 16 }}
                                initial={{ opacity: 0, scale: 0.98 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.98 }}
                                transition={{ layout: { type: "spring", bounce: 0, duration: 0.6 }, opacity: { duration: 0.3 } }}
                                className="flex flex-wrap gap-2 border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1.5 shadow-xl w-full"
                              >
                                {CATEGORIES.map((cat) => {
                                  const Icon = CATEGORY_ICONS[cat];
                                  const selected = formData.category === cat;
                                  return (
                                    <button
                                      key={cat}
                                      type="button"
                                      onClick={() => {
                                        update({ category: cat });
                                        setFormatExpanded(false);
                                      }}
                                      className={`group relative flex-1 min-w-[100px] select-none inline-flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-sm font-medium transition-colors duration-300 ${
                                        selected
                                          ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
                                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)]"
                                      }`}
                                    >
                                      <Icon className={`size-5 transition-colors ${selected ? "text-[var(--color-accent)]" : "text-[var(--color-text-faint)] group-hover:text-[var(--color-text)]"}`} />
                                      {CATEGORY_LABELS[cat]}
                                    </button>
                                  );
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      </motion.div>

                      <AnimatePresence>
                        {formData.category === "EVENT" && (
                          <motion.div
                            initial={{ height: 0, opacity: 0, filter: "blur(4px)" }}
                            animate={{ height: "auto", opacity: 1, filter: "blur(0px)" }}
                            exit={{ height: 0, opacity: 0, filter: "blur(4px)" }}
                            transition={{ duration: 0.4, ease: EASE_OUT }}
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
                                className={`block w-full [color-scheme:dark] rounded-xl border ${shakeStep === 1 && !formData.eventAt ? "border-red-500" : "border-[var(--color-border)]"} bg-[var(--color-bg)] px-3 py-2 text-[16px] sm:text-sm text-[var(--color-text)] transition-all duration-500 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgb(255_99_99/0.3)] input-focus-pulse focus:outline-none`}
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
                                className={`block w-full rounded-xl border ${shakeStep === 1 && !formData.eventLocation.trim() ? "border-red-500" : "border-[var(--color-border)]"} bg-[var(--color-bg)] px-3 py-2 text-[16px] sm:text-sm text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-all duration-500 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgb(255_99_99/0.3)] input-focus-pulse focus:outline-none`}
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
                            className={`block w-full resize-y min-h-[120px] max-h-[60vh] rounded-xl border ${shakeStep === 2 && formData.body.trim().length <= 5 ? "border-red-500" : "border-[var(--color-border)]"} bg-[var(--color-bg)] px-3 py-2 text-[16px] sm:text-sm text-[var(--color-text)] placeholder-[var(--color-text-faint)] transition-all duration-500 hover:border-[var(--color-accent)] hover:shadow-[0_0_12px_rgb(255_99_99/0.3)] input-focus-pulse focus:outline-none`}
                          />
                      </motion.div>

                      {formData.category !== "EVENT" && formData.category !== null && (
                        <motion.div variants={itemVariants} className="flex flex-col gap-2.5 relative">
                          <label className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                            Кого шукаєте в команду?
                          </label>
                          <div className="flex flex-wrap gap-2 mb-1">
                            <AnimatePresence>
                              {formData.needsRoles.map((role) => (
                                <motion.div
                                  key={role}
                                  layout
                                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
                                  className="flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-3 py-1.5 text-xs font-medium text-[var(--color-accent)] shadow-sm"
                                >
                                  <IconUsers className="size-3.5" />
                                  {role}
                                  <button type="button" onClick={() => removeRole(role)} className="ml-1 p-2 -my-2 -mr-2 hover:text-[var(--color-accent-strong)] transition-colors">
                                    <IconClose className="size-3.5" />
                                  </button>
                                </motion.div>
                              ))}
                            </AnimatePresence>
                          </div>
                          
                          <motion.div layout transition={{ type: "spring", bounce: 0, duration: 0.6 }} className="relative flex items-center min-h-[42px] w-full max-w-sm">
                            <AnimatePresence mode="popLayout">
                              {!isRolePaletteOpen ? (
                                <motion.button
                                  key="add-role-btn"
                                  layoutId="role-island"
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.95 }}
                                  transition={{ layout: { type: "spring", bounce: 0, duration: 0.6 }, opacity: { duration: 0.3 } }}
                                  type="button"
                                  onClick={() => setRolePaletteOpen(true)}
                                  className="inline-flex items-center gap-2 rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                                >
                                  + Додати роль
                                </motion.button>
                              ) : (
                                <motion.div
                                  key="role-input-panel"
                                  layoutId="role-island"
                                  initial={{ opacity: 0, scale: 0.98 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.98 }}
                                  transition={{ layout: { type: "spring", bounce: 0, duration: 0.6 }, opacity: { duration: 0.3 } }}
                                  className="flex flex-col w-full rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-xl overflow-hidden"
                                >
                                  <div className="flex items-center gap-2 border-b border-[var(--color-border)] p-2">
                                    <IconUsers className="size-4 text-[var(--color-text-muted)] ml-1" />
                                    <input
                                      autoFocus
                                      type="text"
                                      value={roleInput}
                                      onChange={(e) => setRoleInput(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          const newRole = roleInput.trim();
                                          if (newRole && !formData.needsRoles.includes(newRole)) {
                                            update({ needsRoles: [...formData.needsRoles, newRole] });
                                            setRoleInput("");
                                            setRolePaletteOpen(false);
                                          }
                                        }
                                      }}
                                      placeholder="Пошук або нова роль..."
                                      className="flex-1 bg-transparent text-[16px] sm:text-sm text-[var(--color-text)] outline-none placeholder-[var(--color-text-faint)] py-1"
                                    />
                                    <button type="button" onClick={() => { setRolePaletteOpen(false); setRoleInput(""); }} className="p-3 -m-2 hover:text-[var(--color-text)] text-[var(--color-text-muted)]">
                                      <IconClose className="size-4" />
                                    </button>
                                  </div>
                                  <div className="max-h-[200px] overflow-y-auto no-scrollbar flex flex-col p-1">
                                    {filteredRoles.map((role) => (
                                      <button
                                        key={role}
                                        type="button"
                                        onClick={() => {
                                          update({ needsRoles: [...formData.needsRoles, role] });
                                          setRoleInput("");
                                          setRolePaletteOpen(false);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-subtle)]"
                                      >
                                        {role}
                                      </button>
                                    ))}
                                    
                                    {roleInput.trim() && !filteredRoles.some(r => r.toLowerCase() === roleInput.trim().toLowerCase()) && !formData.needsRoles.some(r => r.toLowerCase() === roleInput.trim().toLowerCase()) && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          update({ needsRoles: [...formData.needsRoles, roleInput.trim()] });
                                          setRoleInput("");
                                          setRolePaletteOpen(false);
                                        }}
                                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/10"
                                      >
                                        Створити "{roleInput.trim()}"
                                      </button>
                                    )}

                                    {filteredRoles.length === 0 && !roleInput.trim() && (
                                      <p className="py-3 text-center text-sm text-[var(--color-text-muted)]">Почніть вводити назву ролі</p>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        </motion.div>
                      )}

                      <motion.div variants={itemVariants} className="flex flex-col gap-2.5">
                        <label className="text-sm font-medium text-[var(--color-text-muted)] select-none">
                          Теги (не обов'язково)
                        </label>
                        <div
                          className={`flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-2 transition-all duration-500 focus-within:border-[var(--color-accent)] focus-within:shadow-[0_0_12px_rgb(255_99_99/0.3)] input-focus-pulse`}
                        >
                          <AnimatePresence mode="popLayout">
                            {formData.tags.map((tag) => (
                              <motion.span
                                key={tag}
                                layout
                                initial={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }}
                                animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                                exit={{ opacity: 0, scale: 0.8, filter: "blur(4px)" }}
                                transition={{ type: "spring", stiffness: 400, damping: 25, bounce: 0.4 }}
                                className="inline-flex items-center gap-1 rounded-[var(--radius-chip)] border border-[var(--color-border-strong)] bg-[var(--color-bg-subtle)] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]"
                              >
                                #{tag}
                                <button type="button" onClick={() => removeTag(tag)} className="ml-1 p-2 -my-2 -mr-2 hover:text-[var(--color-text)] transition-colors">
                                  <IconClose className="size-3" />
                                </button>
                              </motion.span>
                            ))}
                          </AnimatePresence>
                          <motion.input
                            layout
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={handleTagKeyDown}
                            placeholder="Додати тег..."
                            className="flex-1 bg-transparent min-w-[100px] px-1 text-[16px] sm:text-sm text-[var(--color-text)] outline-none placeholder-[var(--color-text-faint)]"
                          />
                        </div>
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
                            onClick={() => update({ visibility: "UKMA_ONLY" })}
                            className={`group select-none flex flex-col items-start gap-2 rounded-[20px] border p-5 text-left transition-all active:scale-[0.98] ${formData.visibility === "UKMA_ONLY"
                                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[0_0_24px_rgba(255,99,99,0.1)]"
                                : "border-[var(--color-border-strong)] bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]"
                              }`}
                          >
                            <div className={`flex items-center gap-2 transition-colors ${formData.visibility === "UKMA_ONLY" ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}>
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

              <motion.div variants={itemVariants} layout transition={{ duration: 0.4, ease: EASE_OUT }} className="sticky bottom-0 z-30 mt-12 flex items-center justify-between border-t border-[var(--color-border-strong)] bg-[var(--color-bg)]/90 backdrop-blur-md pt-4 pb-8 px-1 -mx-1 sm:static sm:bg-transparent sm:backdrop-blur-none sm:pb-0 sm:px-0 sm:mx-0 sm:pt-6">
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
                    className="active:scale-[0.97] transition-transform shadow-[0_0_20px_rgba(255,99,99,0.3)] hover:shadow-[0_0_30px_rgba(255,99,99,0.4)]"
                  >
                    Опублікувати
                  </Button>
                )}
              </motion.div>
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
          {data.visibility === "UKMA_ONLY" && (
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
