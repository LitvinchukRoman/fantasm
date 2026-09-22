"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Ambient "light ribbons" behind the hero — amber sine waves that slowly flow
 * across a dark field (respeecher-style), in our "idea = light" concept. Canvas
 * 2D, zero deps.
 *
 * Guards:
 * - the canvas is a REPLACED element, so `absolute inset-0` alone does NOT
 *   stretch it — it keeps its (huge) buffer size and blows out layout. We force
 *   CSS width/height:100% (`size-full`) and size the drawing buffer from the
 *   PARENT rect, so there is no ResizeObserver feedback loop.
 * - pauses when off-screen (IntersectionObserver) and when the tab is hidden,
 * - honours prefers-reduced-motion (one static frame, no rAF loop),
 * - re-reads theme colours when the <html> class flips (light/dark toggle),
 * - DPR capped at 1.5. Purely decorative: aria-hidden + pointer-events:none.
 */
export function FlowLines({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    // Aliased to non-null-typed consts so narrowing survives inside the nested
    // closures below (TS otherwise falls back to the union declared type).
    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;
    // Size from the parent so the (replaced) canvas can never drive its own size.
    const host: HTMLElement = canvas.parentElement ?? canvas;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

    let width = 0;
    let height = 0;

    // Resolve a CSS custom property (OKLCH) to an rgb triple via a probe
    // element — canvas strokeStyle rgb() works everywhere, oklch() does not.
    function readRGB(varName: string, fallback: [number, number, number]): [number, number, number] {
      const probe = document.createElement("span");
      probe.style.cssText = `color:var(${varName});position:absolute;opacity:0;pointer-events:none`;
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      const m = c.match(/[\d.]+/g);
      if (!m || m.length < 3) return fallback;
      return [Number(m[0]), Number(m[1]), Number(m[2])];
    }

    let accent: [number, number, number] = [242, 181, 68];
    let accent2: [number, number, number] = [201, 143, 45];
    function readColors() {
      accent = readRGB("--accent", [242, 181, 68]);
      accent2 = readRGB("--accent-ink", [201, 143, 45]);
    }

    type Line = {
      base: number;
      a1: number;
      a2: number;
      k1: number;
      k2: number;
      sp: number;
      ph: number;
      w: number;
      alpha: number;
    };
    let lines: Line[] = [];
    function buildLines() {
      const n = width < 640 ? 11 : 20;
      lines = Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1);
        return {
          base: height * (0.02 + 0.96 * t),
          a1: height * (0.03 + 0.07 * Math.random()),
          a2: height * (0.015 + 0.04 * Math.random()),
          k1: (Math.PI * 2) / (width * (0.55 + 0.8 * Math.random())),
          k2: (Math.PI * 2) / (width * (0.22 + 0.35 * Math.random())),
          sp: 0.12 + 0.22 * Math.random(),
          ph: Math.random() * Math.PI * 2,
          w: 1.1 + Math.random() * 1.4,
          // Visible ribbon field, brighter toward the top-left light source.
          alpha: 0.16 + 0.24 * Math.max(0, 1 - t * 0.9),
        };
      });
    }

    function resize() {
      const rect = host.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (w === width && h === height) return; // no-op → breaks any feedback loop
      width = w;
      height = h;
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildLines();
    }

    function draw(clock: number) {
      ctx.clearRect(0, 0, width, height);
      const step = width < 640 ? 12 : 8;
      for (const ln of lines) {
        ctx.beginPath();
        for (let x = 0; x <= width; x += step) {
          const y =
            ln.base +
            ln.a1 * Math.sin(ln.k1 * x + clock * ln.sp + ln.ph) +
            ln.a2 * Math.sin(ln.k2 * x - clock * ln.sp * 0.7 + ln.ph * 1.7);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        const grad = ctx.createLinearGradient(0, 0, width, 0);
        grad.addColorStop(0, `rgba(${accent[0]},${accent[1]},${accent[2]},${ln.alpha})`);
        grad.addColorStop(1, `rgba(${accent2[0]},${accent2[1]},${accent2[2]},${ln.alpha * 0.4})`);
        ctx.strokeStyle = grad;
        ctx.lineWidth = ln.w;
        ctx.stroke();
      }
    }

    let raf = 0;
    let running = false;
    let last = 0;
    let clock = 0;
    function frame(now: number) {
      if (!last) last = now;
      const dt = Math.min(64, now - last);
      last = now;
      clock += dt / 1000;
      draw(clock);
      raf = requestAnimationFrame(frame);
    }
    function start() {
      if (running || reduce.matches) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    readColors();
    resize();
    if (reduce.matches) draw(0);
    else start();

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !document.hidden) start();
        else stop();
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    const ro = new ResizeObserver(() => {
      resize();
      if (reduce.matches) draw(0);
    });
    ro.observe(host);

    const mo = new MutationObserver(() => {
      readColors();
      if (reduce.matches) draw(0);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const onReduceChange = () => {
      stop();
      if (reduce.matches) draw(0);
      else start();
    };
    reduce.addEventListener("change", onReduceChange);

    return () => {
      stop();
      io.disconnect();
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      reduce.removeEventListener("change", onReduceChange);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn("block size-full", className)}
      style={{ pointerEvents: "none" }}
    />
  );
}
