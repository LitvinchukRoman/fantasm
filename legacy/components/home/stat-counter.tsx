"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "framer-motion";

/** Counts up once when scrolled into view. Respects reduced-motion (shows final). */
export function StatCounter({
  value,
  label,
  suffix = "",
}: {
  value: number;
  label: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView || reduce) return;
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setN(Math.round(v)),
    });
    return () => controls.stop();
  }, [inView, value, reduce]);

  return (
    <div ref={ref}>
      <div className="text-h2 tabnums text-[color:var(--ink)]">
        {n}
        {suffix}
      </div>
      <div className="mt-0.5 text-sm text-[color:var(--ink-2)]">{label}</div>
    </div>
  );
}
