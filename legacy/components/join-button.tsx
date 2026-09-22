"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { api, ApiError } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import type { Participant } from "@/lib/types";

/**
 * Join / leave (team) or RSVP (events). On success the label morphs to
 * "Ви в команді" and a checkmark draws itself (pathLength) instead of a hard
 * icon swap.
 */
export function JoinButton({
  ideaId,
  initialJoined,
  label = "Долучитися",
  joinedLabel = "Ви в команді",
}: {
  ideaId: number;
  initialJoined: boolean;
  label?: string;
  joinedLabel?: string;
}) {
  const [joined, setJoined] = useState(initialJoined);
  const [busy, setBusy] = useState(false);
  const reduce = useReducedMotion();

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (joined) {
        await api.del(`/api/v1/ideas/${ideaId}/join`);
        setJoined(false);
      } else {
        await api.post<Participant>(`/api/v1/ideas/${ideaId}/join`, {});
        setJoined(true);
        if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
      }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) window.location.href = "/login";
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={joined ? "secondary" : "primary"} onClick={toggle} disabled={busy} aria-pressed={joined}>
      {joined ? (
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <motion.path
            d="M5 12.5l4.5 4.5L19 7"
            initial={reduce ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          />
        </svg>
      ) : (
        <UserPlus />
      )}
      {joined ? joinedLabel : label}
    </Button>
  );
}
