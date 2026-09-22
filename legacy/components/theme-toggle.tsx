"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

function readTheme(): Theme {
  const root = document.documentElement;
  if (root.classList.contains("dark")) return "dark";
  if (root.classList.contains("light")) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(next: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(next);
  root.style.colorScheme = next;
  // Persist for a year; read by the inline init script on next load (no FOUC).
  document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Theme switch with a cinematic circular reveal (View Transitions API).
 * Falls back to an instant class swap where VT / reduced-motion apply — the
 * CSS colour transitions still make it feel smooth.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => setTheme(readTheme()), []);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    const next: Theme = (theme ?? readTheme()) === "dark" ? "light" : "dark";
    const root = document.documentElement;

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const supportsVT =
      typeof document !== "undefined" &&
      "startViewTransition" in document &&
      !prefersReduced;

    if (!supportsVT) {
      applyTheme(next);
      setTheme(next);
      return;
    }

    // Origin of the reveal = the toggle button's centre.
    const rect = e.currentTarget.getBoundingClientRect();
    root.style.setProperty("--vt-x", `${((rect.left + rect.width / 2) / window.innerWidth) * 100}%`);
    root.style.setProperty("--vt-y", `${((rect.top + rect.height / 2) / window.innerHeight) * 100}%`);
    root.classList.add("vt-theme");

    const vt = (document as Document & {
      startViewTransition: (cb: () => void) => { finished: Promise<void> };
    }).startViewTransition(() => {
      applyTheme(next);
      setTheme(next);
    });
    vt.finished.finally(() => root.classList.remove("vt-theme"));
  }

  return (
    <button
      type="button"
      aria-label="Перемкнути тему"
      onClick={toggle}
      className="grid size-9 place-items-center rounded-full text-[color:var(--ink-2)] transition-colors duration-[var(--dur-1)] hover:bg-[color:oklch(from_var(--ink)_l_c_h/0.06)] hover:text-[color:var(--ink)] active:scale-95"
    >
      {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
