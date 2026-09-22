"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * The signature hero graphic: a single spark (top) whose lines reach out and
 * connect a scatter of nodes into a team. Lines draw themselves in on mount;
 * a scroll-driven variant is layered on in globals via `animation-timeline`
 * where supported. One cinematic moment per page — not decoration on every card.
 */
const NODES = [
  { x: 50, y: 12, r: 4, hub: true },
  { x: 20, y: 40, r: 2.6 },
  { x: 80, y: 38, r: 2.6 },
  { x: 30, y: 74, r: 3 },
  { x: 68, y: 78, r: 2.4 },
  { x: 50, y: 58, r: 2.2 },
];
const EDGES = [
  [0, 1],
  [0, 2],
  [0, 5],
  [5, 3],
  [5, 4],
  [1, 3],
  [2, 4],
];

export function Constellation({ className }: { className?: string }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden fill="none">
      {EDGES.map(([a, b], i) => (
        <motion.line
          key={i}
          x1={NODES[a].x}
          y1={NODES[a].y}
          x2={NODES[b].x}
          y2={NODES[b].y}
          stroke="var(--accent)"
          strokeOpacity={0.5}
          strokeWidth={0.5}
          initial={reduce ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.5 }}
          transition={{ duration: 1.1, delay: 0.2 + i * 0.14, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
      {NODES.map((n, i) => (
        <motion.circle
          key={i}
          cx={n.x}
          cy={n.y}
          r={n.r}
          fill={n.hub ? "var(--accent)" : "var(--ink-3)"}
          initial={reduce ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: n.hub ? 1 : 0.8 }}
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 + i * 0.12 }}
          style={{ transformOrigin: `${n.x}px ${n.y}px` }}
        />
      ))}
      {/* soft glow around the spark */}
      <motion.circle
        cx={NODES[0].x}
        cy={NODES[0].y}
        r={10}
        fill="var(--accent)"
        initial={{ opacity: 0 }}
        animate={{ opacity: reduce ? 0.12 : [0.05, 0.18, 0.05] }}
        transition={reduce ? { duration: 0.2 } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
        style={{ filter: "blur(6px)" }}
      />
    </svg>
  );
}
