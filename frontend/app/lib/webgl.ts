import type { ProbeResult } from "./webgl-probe.worker";
import { isSoftwareRenderer } from "./webgl-renderer";

let probe: Promise<boolean> | undefined;

/**
 * Чи варто запускати декоративний WebGL. Програмний рендер (SwiftShader, llvmpipe: немає GPU або
 * драйвер у блок-листі) рахує кожен кадр на CPU в основному потоці, і сцена замість фону
 * блокує сторінку на секунди. failIfMajorPerformanceCaveat ловить не всі такі випадки:
 * Chrome з примусовим SwiftShader контекст усе одно віддає, тому дивимось і на назву рендерера.
 * Перевірка йде у воркері й один раз на вкладку.
 */
export function hasHardwareWebGL(): Promise<boolean> {
  probe ??= typeof OffscreenCanvas === "function" ? probeInWorker() : Promise.resolve(probeOnMainThread());
  return probe;
}

/** Якщо воркер не зміг відповісти (немає WebGL в OffscreenCanvas, воркер не завантажився), пробуємо по-старому. */
function probeInWorker(): Promise<boolean> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL("./webgl-probe.worker.ts", import.meta.url), { type: "module" });
    const finish = (result: ProbeResult) => {
      worker.terminate();
      resolve(result === "unsupported" ? probeOnMainThread() : result);
    };
    worker.onmessage = (event: MessageEvent<ProbeResult>) => finish(event.data);
    worker.onerror = () => finish("unsupported");
  });
}

function probeOnMainThread(): boolean {
  const canvas = document.createElement("canvas");
  const options: WebGLContextAttributes = { failIfMajorPerformanceCaveat: true };
  const gl = (canvas.getContext("webgl2", options) ?? canvas.getContext("webgl", options)) as
    | WebGLRenderingContext
    | null;
  if (!gl) return false;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  return !isSoftwareRenderer(renderer);
}

/**
 * Викликає task, коли сторінка завантажилась, перший кадр уже на екрані й основний потік вільний.
 * Компіляція шейдерів синхронна й займає сотні мілісекунд на телефоні, тож вона не повинна
 * збігатися з гідратацією та першими кліками. Новий WebGL-контекст ще й стає в чергу GPU-процесу
 * поперед композитора, тому чекаємо rAF: без GPU-прискорення перший кадр інакше запізнюється.
 * Повертає скасування.
 */
export function whenIdleAfterLoad(task: () => void, timeout = 2000): () => void {
  let cancelled = false;
  let frameId = 0;
  let idleId = 0;
  let timerId = 0;
  const run = () => !cancelled && task();
  const idle = () => {
    if (cancelled) return;
    // Safari до 18.4 не має requestIdleCallback.
    if (typeof window.requestIdleCallback === "function") idleId = window.requestIdleCallback(run, { timeout });
    else timerId = window.setTimeout(run, 200);
  };
  const schedule = () => {
    if (!cancelled) frameId = window.requestAnimationFrame(idle);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", schedule);
    if (frameId) window.cancelAnimationFrame(frameId);
    if (idleId) window.cancelIdleCallback(idleId);
    if (timerId) window.clearTimeout(timerId);
  };
}
