import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { createAura } from "./aura";
import { createFluid } from "./fluid";
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
 *
 * Під пилом сфери лежить аура (aura.ts): м'яке туманне світіння без частинок, що тече й дихає,
 * сірий туман з червоним акцентом у щільних ділянках, як у Sidekick на Editions.
 *
 * Мобільні: сфера масштабується під ширину кадру й стоїть нижче за заголовок, кількість точок і
 * роздільність постпроцесингу менші, а якщо кадри повільні (<~38 fps), якість знижується ще на
 * два кроки. Назад вона не піднімається, щоб не смикатися.
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

  const aura = createAura();
  // Аура в окремій сцені після bloom: вона вже мʼяка, а bloom із порогом 0.22 збирав би її в білі плями.
  const auraScene = new THREE.Scene();
  auraScene.add(aura.mesh);

  const { points, uniforms, count, radius } = createSpherePointCloud();
  scene.add(points);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.95, 0.78, 0.22);
  composer.addPass(bloomPass);

  const afterimagePass = new AfterimagePass(0.5);
  composer.addPass(afterimagePass);

  const auraPass = new RenderPass(auraScene, camera);
  auraPass.clear = false;
  composer.addPass(auraPass);

  const vignetteGrainPass = createVignetteGrainPass({
    amount: 0.42,
    radius: 0.95,
    softness: 0.55,
    grainAmount: 0.02,
  });
  vignetteGrainPass.renderToScreen = true;
  composer.addPass(vignetteGrainPass);

  /** 0 повна якість, 1 і 2 послідовно дешевші. Тільки зростає. */
  let level = 0;
  let compact = false;
  /** Частка точок за площею сфери: менша сфера потребує пропорційно менше точок, інакше аддитивне змішування вибілює її. */
  let density = 1;
  let viewWidth = 1;
  let viewHeight = 1;
  let slowFrames = 0;
  let sampledFrames = 0;
  let sampledTime = 0;

  /** Частка точок і масштаб постпроцесингу для поточного режиму та рівня якості. */
  function applyQuality() {
    const fraction = density * [1, 0.75, 0.55][level];
    points.geometry.setDrawRange(0, Math.floor(count * fraction));
    const dpr = Math.min(window.devicePixelRatio || 1, compact ? 1 : 1.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(viewWidth, viewHeight, false);
    composer.setPixelRatio((compact ? 0.75 : 1) * [1, 0.8, 0.65][level]);
    composer.setSize(viewWidth, viewHeight);
    uniforms.uPixelRatio.value = dpr;
  }

  /** Знижує якість, якщо середній кадр довший за ~26 мс упродовж двох послідовних вибірок по 60 кадрів. */
  function watchPerformance(delta: number) {
    if (level >= 2 || delta > 0.25) return;
    sampledFrames++;
    sampledTime += delta;
    if (sampledFrames < 60) return;
    slowFrames = sampledTime / sampledFrames > 0.026 ? slowFrames + 1 : 0;
    sampledFrames = 0;
    sampledTime = 0;
    if (slowFrames >= 2) {
      level++;
      slowFrames = 0;
      applyQuality();
    }
  }

  let baseDamp = 0.5;
  let reducedMotion = false;
  let active = true;
  let rafId = 0;
  const clock = new THREE.Clock();
  let disposed = false;

  const mouseTarget = new THREE.Vector2(0, 0);
  const lastPointer = new THREE.Vector2();
  let pointerPrimed = false;

  function onPointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    mouseTarget.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    );
    // Перша позиція вказівника не повинна давати ривок від центру екрана.
    if (!pointerPrimed) {
      lastPointer.copy(mouseTarget);
      pointerPrimed = true;
    }
  }
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerMove, { passive: true });

  // Рідка маса з інерцією (fluid.ts): курсор штовхає ауру й пил сфери, вони відхиляються, перелітають
  // і гаснуть пружиною; діра під курсором заповнюється майже одразу. Рух рахуємо у висотах екрана.
  const fluid = createFluid(renderer);
  function feedFluid(delta: number) {
    if (delta <= 0 || !pointerPrimed) return;
    // Згладжений курсор: ауру штовхає не сам вказівник, а його м'яке «тіло» з запізненням.
    const follow = 1 - Math.exp(-delta * 9);
    const aspect = viewWidth / Math.max(1, viewHeight);
    const dx = (mouseTarget.x - lastPointer.x) * follow;
    const dy = (mouseTarget.y - lastPointer.y) * follow;
    lastPointer.x += dx;
    lastPointer.y += dy;
    const vx = (dx * 0.5 * aspect) / delta;
    const vy = (dy * 0.5) / delta;
    const speed = Math.hypot(vx, vy);
    if (reducedMotion || speed < 0.03) return;
    // Швидкість обмежена: різкий ривок не повинен рвати ауру. Довжина хвоста росте зі швидкістю.
    const capped = Math.min(speed, 2.5);
    fluid.splat(
      lastPointer.x * 0.5 + 0.5,
      lastPointer.y * 0.5 + 0.5,
      vx,
      vy,
      Math.min(1, speed / 1.6),
      capped * 0.042,
      capped * 0.036,
      Math.min(speed * 0.12, 0.1),
    );
  }

  function frame() {
    rafId = 0;
    if (disposed || !active) return;
    rafId = requestAnimationFrame(frame);

    const delta = clock.getDelta();
    const timeScale = reducedMotion ? 0.08 : 1;
    uniforms.uTime.value += delta * timeScale;
    aura.uniforms.uTime.value += delta * timeScale;
    watchPerformance(delta);


    feedFluid(delta);
    if (!reducedMotion) fluid.step(delta);
    aura.uniforms.uFluid.value = fluid.fieldTexture;
    aura.uniforms.uHole.value = fluid.holeTexture;
    uniforms.uFluid.value = fluid.fieldTexture;
    uniforms.uHole.value = fluid.holeTexture;

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
      afterimagePass.uniforms.damp.value = reduced ? 0.45 : baseDamp;
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
      viewWidth = width;
      viewHeight = height;
      compact = width < 800 || window.matchMedia("(pointer: coarse)").matches;
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();

      const distance = camera.position.z;
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
      const halfW = halfH * camera.aspect;
      uniforms.uViewHalf.value.set(halfW, halfH);

      // Широкий екран: сфера праворуч, як і була. Вузький: радіус 1.1 ширини кадру, центр під заголовком.
      const wide = width >= 800;
      const scale = wide ? 1 : Math.min(1, (halfW * 1.1) / radius);
      uniforms.uScale.value = scale;
      density = wide ? 1 : Math.min(1, Math.max(0.15, scale * scale * 1.8));
      applyQuality();
      uniforms.uPointSize.value = 1.45 * (wide ? 1 : 0.7 + 0.3 * scale);
      uniforms.uCenter.value.set(wide ? 1.2 : 0, wide ? 0.02 : -halfH * 0.56);

      aura.uniforms.uViewHalf.value.set(halfW, halfH);
      aura.uniforms.uRadius.value = radius * scale;
      aura.uniforms.uCenter.value.copy(uniforms.uCenter.value);
      aura.uniforms.uFlow.value.set(wide ? -0.95 : 0.2, wide ? 0.3 : 1);
      aura.uniforms.uStrength.value = wide ? 1 : 0.9;
      fluid.resize(width, height);

      baseDamp = 0.5;
      afterimagePass.uniforms.damp.value = reducedMotion ? 0.45 : baseDamp;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(rafId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerMove);
      aura.dispose();
      fluid.dispose();
      points.geometry.dispose();
      (points.material as THREE.Material).dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
