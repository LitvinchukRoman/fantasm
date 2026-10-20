/// <reference lib="webworker" />
import { isSoftwareRenderer } from "./webgl-renderer";

export type ProbeResult = boolean | "unsupported";

function context(options?: WebGLContextAttributes) {
  const canvas = new OffscreenCanvas(1, 1);
  return (canvas.getContext("webgl2", options) ?? canvas.getContext("webgl", options)) as WebGLRenderingContext | null;
}

/** Перший WebGL-контекст піднімає GPU-процес (а SwiftShader ще й JIT), тому пробуємо його тут, не в основному потоці. */
function probe(): ProbeResult {
  const gl = context({ failIfMajorPerformanceCaveat: true });
  if (!gl) {
    // Без суворого прапорця контекст є: рендер повільний, сцену не запускаємо. Немає й так:
    // WebGL у воркері не підтримується (Safari 16.4–16.x), відповідь дасть основний потік.
    const loose = context();
    loose?.getExtension("WEBGL_lose_context")?.loseContext();
    return loose ? false : "unsupported";
  }
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const ok = !isSoftwareRenderer(String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return ok;
}

self.postMessage(probe());
