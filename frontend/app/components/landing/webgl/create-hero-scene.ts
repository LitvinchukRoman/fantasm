import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { createSpherePointCloud } from "./sphere-point-cloud";
import { createVignetteGrainPass } from "./vignette-grain-pass";

export type HeroSceneHandle = {
  setReducedMotion: (reduced: boolean) => void;
  /** false зупиняє rAF, коли сфера закрита сірою сторінкою або вийшла з кадру. */
  setActive: (active: boolean) => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
};

/**
 * Повноекранна сфера-point-cloud. Постпроцесинг (bloom, vignette,
 * afterimage) лишається тим самим класом ефектів, що й на Editions, але
 * strength/threshold притишені: адитивний точковий рендер без їхніх
 * відео-масок інакше зливається в білу пляму. Окремий спрайт-ядра тут
 * навмисно немає: він давав суцільний білий диск замість м'якого світіння
 * з видимими точками всередині.
 */
export function createHeroScene(canvas: HTMLCanvasElement): HeroSceneHandle {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 30);
  camera.position.set(0, 0.05, 5.15);
  camera.lookAt(0.35, 0.02, 0);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x08090a, 1);

  const { points, uniforms } = createSpherePointCloud();
  scene.add(points);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.95, 0.78, 0.22);
  composer.addPass(bloomPass);

  const afterimagePass = new AfterimagePass(0.45);
  composer.addPass(afterimagePass);

  const vignetteGrainPass = createVignetteGrainPass({
    amount: 0.42,
    radius: 0.95,
    softness: 0.55,
    grainAmount: 0.02,
  });
  vignetteGrainPass.renderToScreen = true;
  composer.addPass(vignetteGrainPass);

  let reducedMotion = false;
  let active = true;
  let rafId = 0;
  const clock = new THREE.Clock();
  let disposed = false;

  const mouseTarget = new THREE.Vector2(0, 0);
  const mouseCurrent = new THREE.Vector2(0, 0);
  const mouseRest = new THREE.Vector2(0, 0);

  function onPointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    mouseTarget.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });

  function frame() {
    rafId = 0;
    if (disposed || !active) return;
    rafId = requestAnimationFrame(frame);

    const delta = clock.getDelta();
    const timeScale = reducedMotion ? 0.08 : 1;
    uniforms.uTime.value += delta * timeScale;

    mouseCurrent.lerp(reducedMotion ? mouseRest : mouseTarget, 0.08);
    uniforms.uMouse.value.copy(mouseCurrent);

    const vignetteUniforms = vignetteGrainPass.uniforms as { uTime: { value: number } };
    vignetteUniforms.uTime.value += delta;

    composer.render();
  }

  function start() {
    if (disposed || !active || rafId) return;
    clock.getDelta();
    rafId = requestAnimationFrame(frame);
  }

  start();

  return {
    setReducedMotion(reduced: boolean) {
      reducedMotion = reduced;
    },
    setActive(next: boolean) {
      if (active === next) return;
      active = next;
      if (next) start();
      else if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    resize(width: number, height: number) {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      composer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      uniforms.uPixelRatio.value = dpr;

      const distance = camera.position.z;
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
      const halfW = halfH * camera.aspect;
      uniforms.uViewHalf.value.set(halfW, halfH);

      const wide = width >= 800;
      const centerX = wide ? 1.2 : 0.15;
      const centerY = wide ? 0.02 : -0.05;
      uniforms.uCenter.value.set(centerX, centerY);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
