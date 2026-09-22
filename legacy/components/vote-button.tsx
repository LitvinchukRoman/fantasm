"use client";

import { useState } from "react";
import { ArrowBigUp } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { api, ApiError } from "@/lib/client-api";
import type { VoteResult } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Optimistic upvote. The count rolls like an odometer (direction follows the
 * delta), the whole control springs on press, and a tiny haptic tick fires on
 * supporting devices. Reverts on error / sends to /login on 401.
 */
export function VoteButton({
  ideaId,
  initialScore,
  initialVoted,
  size = "md",
}: {
  ideaId: number;
  initialScore: number;
  initialVoted: boolean;
  size?: "sm" | "md";
}) {
  const [score, setScore] = useState(initialScore);
  const [voted, setVoted] = useState(initialVoted);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const prev = { score, voted };
    const nextVoted = !voted;
    setDir(nextVoted ? 1 : -1);
    setVoted(nextVoted);
    setScore(score + (nextVoted ? 1 : -1));
    if (nextVoted && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(8);
    try {
      const res = await api.post<VoteResult>(`/api/v1/ideas/${ideaId}/vote`);
      setScore(res.votesScore);
      setVoted(res.voted);
    } catch (e) {
      setScore(prev.score);
      setVoted(prev.voted);
      if (e instanceof ApiError && e.status === 401) window.location.href = "/login";
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.button
      type="button"
      onClick={toggle}
      aria-pressed={voted}
      aria-label={voted ? "Прибрати голос" : "Підтримати ідею"}
      whileTap={reduce ? undefined : { scale: 0.92 }}
      className={cn(
        "inline-flex h-fit shrink-0 flex-col items-center justify-center rounded-xl border transition-colors duration-[var(--dur-1)]",
        size === "md" ? "min-w-14 gap-0.5 px-3 py-2" : "min-w-11 gap-0 px-2 py-1.5",
        voted
          ? "border-transparent bg-[var(--accent)] text-[color:var(--accent-contrast)]"
          : "border-[var(--line)] bg-[var(--surface-1)] text-[color:var(--ink-2)] hover:border-[var(--line-strong)] hover:text-[color:var(--ink)]",
      )}
    >
      <motion.span animate={reduce ? undefined : { y: voted ? -1 : 0 }}>
        <ArrowBigUp className={cn(size === "md" ? "size-5" : "size-4", voted && "fill-current")} />
      </motion.span>
      <span className="relative h-5 overflow-hidden text-sm font-semibold tabnums">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={score}
            initial={reduce ? false : { y: dir * 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? undefined : { y: dir * -16, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            className="block"
          >
            {score}
          </motion.span>
        </AnimatePresence>
      </span>
    </motion.button>
  );
}
