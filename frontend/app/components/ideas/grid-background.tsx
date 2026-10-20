import { useEffect, useRef, useState } from "react";
import { hasHardwareWebGL, whenIdleAfterLoad } from "~/lib/webgl";
import type { GridSceneHandle } from "./webgl/create-grid-scene";

/**
 * Живий фон-сітка. WebGL підключається на клієнті після завантаження сторінки. Без апаратного
 * WebGL або при `prefers-reduced-motion` лишається статична CSS-сітка з тими ж лініями, без руху.
 */
export function GridBackground({ interactive = true, calm = true }: { interactive?: boolean; calm?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      setFallback(true);
      return;
    }

    let scene: GridSceneHandle | null = null;
    let cancelled = false;

    const cancelStart = whenIdleAfterLoad(async () => {
      if (!(await hasHardwareWebGL())) {
        if (!cancelled) setFallback(true);
        return;
      }
      if (cancelled) return;
      import("./webgl/create-grid-scene")
        .then(({ createGridScene }) => {
          if (cancelled) return;
          const compact = window.innerWidth < 1024;
          scene = createGridScene(canvas, { segments: compact ? 140 : 200, interactive, calm });
          const rect = host.getBoundingClientRect();
          scene.resize(rect.width, rect.height);
        })
        .catch(() => {
          if (!cancelled) setFallback(true);
        });
    });

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) scene?.resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(host);

    return () => {
      cancelled = true;
      cancelStart();
      observer.disconnect();
      scene?.dispose();
    };
  }, [interactive, calm]);

  if (fallback) return <div className="ideas-grid-static" />;
  return <canvas ref={canvasRef} className="ideas-grid-canvas" />;
}
