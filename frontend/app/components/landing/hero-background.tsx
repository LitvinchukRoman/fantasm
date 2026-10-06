import { useEffect, useRef } from "react";
import type { HeroSceneHandle } from "./webgl/create-hero-scene";

/**
 * Повноекранна сфера. WebGL лише на клієнті: до гідратації видно CSS-підкладку
 * того самого радіального світіння, тож кадр не чорніє.
 */
export function HeroBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let scene: HeroSceneHandle | null = null;
    let cancelled = false;

    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncActivity = (isIntersecting: boolean) => {
      if (!scene) return;
      scene.setReducedMotion(reducedMotionQuery.matches);
      scene.setActive(isIntersecting);
    };

    import("./webgl/create-hero-scene").then(({ createHeroScene }) => {
      if (cancelled) return;
      scene = createHeroScene(canvas);
      const rect = container.getBoundingClientRect();
      applySize(rect.width, rect.height);
      syncActivity(true);
    });

    // Висоту контейнера тримає h-lvh (див. routes/_index.tsx), тож згортання адресного рядка
    // на мобільних її не змінює. Розмір застосовуємо лише коли він справді інший.
    let appliedWidth = 0;
    let appliedHeight = 0;
    const applySize = (width: number, height: number) => {
      if (!scene) return;
      if (Math.abs(width - appliedWidth) < 1 && Math.abs(height - appliedHeight) < 1) return;
      appliedWidth = width;
      appliedHeight = height;
      scene.resize(width, height);
    };

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      applySize(entry.contentRect.width, entry.contentRect.height);
    });
    resizeObserver.observe(container);

    let intersecting = true;
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        intersecting = entry.isIntersecting;
        syncActivity(intersecting);
      },
      { threshold: 0 },
    );
    visibilityObserver.observe(container);

    const onScroll = () => syncActivity(intersecting);
    window.addEventListener("scroll", onScroll, { passive: true });

    const onReducedMotionChange = () => syncActivity(intersecting);
    reducedMotionQuery.addEventListener("change", onReducedMotionChange);

    return () => {
      cancelled = true;
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      reducedMotionQuery.removeEventListener("change", onReducedMotionChange);
      scene?.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden bg-[#08090a] bg-[radial-gradient(ellipse_80%_90%_at_68%_42%,rgba(216,216,216,0.16),transparent_62%)]"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
