"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";
import { X } from "lucide-react";

/**
 * Bottom sheet on mobile → centred dialog on ≥sm. Chrome glass (one of the few
 * translucent surfaces). Springs in from the bottom; Esc + backdrop close.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.div
            className="absolute inset-0 bg-[color-mix(in_oklab,var(--ink)_50%,transparent)]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="chrome relative w-full max-w-lg rounded-t-3xl p-5 sm:rounded-3xl sm:p-6"
            initial={{ y: "100%", opacity: 0.6 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.6 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--line-strong)] sm:hidden" />
            {title && (
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-h3">{title}</h2>
                <button
                  onClick={onClose}
                  aria-label="Закрити"
                  className="grid size-9 place-items-center rounded-full text-[color:var(--ink-2)] hover:bg-[color-mix(in_oklab,var(--ink)_6%,transparent)] hover:text-[color:var(--ink)]"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <div>{children}</div>
            {footer && <div className="mt-5">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
