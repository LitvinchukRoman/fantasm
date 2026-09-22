"use client";

import { AnimatePresence, motion } from "framer-motion";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastCtx = createContext<(message: string, tone?: ToastTone) => void>(() => {});

/** Access the toast dispatcher: `const toast = useToast(); toast("Готово")`. */
export function useToast() {
  return useContext(ToastCtx);
}

const ICON: Record<ToastTone, typeof Info> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};
const COLOR: Record<ToastTone, string> = {
  success: "var(--success)",
  error: "var(--danger)",
  info: "var(--accent-ink)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: ToastTone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
      >
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = ICON[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="chrome pointer-events-auto flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium"
              >
                <Icon className="size-4 shrink-0" style={{ color: COLOR[t.tone] }} />
                <span className="text-[color:var(--ink)]">{t.message}</span>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}
