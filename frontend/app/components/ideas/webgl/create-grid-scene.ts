import * as THREE from "three";
import { SIMPLEX_NOISE_3D_GLSL } from "~/components/landing/webgl/simplex-noise.glsl";

/**
 * Хвиляста сітка фону сторінки ідей. Ідея запозичена з saifullah.dev/projects (WebGL-площина
 * з лініями 1 px), код і шейдери власні, шум simplex той самий, що на головній.
 *
 * Велика площина з густою сіткою вершин. Вершини піднімає повільний simplex-шум, а курсор
 * відтискає ділянку до камери й залишає слід із десяти згасаючих точок, що підсвічують лінії білим.
 * Лінії (квадрати й діагоналі) малює фрагментний шейдер за fwidth, тож вони завжди ≈1.5 px і з м'яким краєм.
 */

const TRAIL_MAX = 10;
const TRAIL_LIFETIME_MS = 1500;
const TRAIL_STEP_MS = 30;
/** Скільки точок слідів тримаємо в пам'яті (за 1.5 с при кроці 30 мс їх до 50). */
const TRAIL_CAP = 60;
const CAMERA_Z = 5;
/** Розмір клітинки сітки у світових одиницях. */
const CELL_SIZE = 0.085;
const FOV = 50;

export type GridSceneHandle = {
  resize: (width: number, height: number) => void;
  /** false зупиняє rAF (вкладка прихована або фон не потрібен). */
  setActive: (active: boolean) => void;
  dispose: () => void;
};

const VERTEX = /* glsl */ `
uniform float uTime;
uniform vec3 uPalette[5];
uniform float uElevation;
uniform float uSpeed;
uniform float uIncline;
uniform float uColorSpeed;
uniform vec2 uMouse;
uniform float uPushRadius;
uniform float uPushStrength;
uniform int uTrailCount;
uniform vec2 uTrailPos[${TRAIL_MAX}];
uniform float uTrailAlpha[${TRAIL_MAX}];
uniform vec3 uTrailColor;
uniform float uTrailRadius;
uniform vec3 uBendColor;
uniform float uBendGlow;
uniform float uSweep;

varying vec3 vColor;
varying vec2 vUv;

${SIMPLEX_NOISE_3D_GLSL}

void main() {
  vUv = uv;

  // Хвиля. Три повільні шари, щоб рух був живим, а не механічним:
  // 1) пагорби, поле яких «тече» крізь шум, а не просто їде вбік (domain warp);
  // 2) великий м'який вал в іншому напрямку, що то підіймає, то опускає ділянки;
  // 3) ледь помітна зяб по діагоналі.
  vec2 field = uv * vec2(3.0, 4.0);
  float t = uTime * uSpeed;
  vec2 warp = vec2(
    snoise(vec3(uv * 1.7, t * 0.9)),
    snoise(vec3(uv * 1.7 + 5.2, t * 0.9))
  );
  vec2 flowField = field + warp * 0.55;
  float hills = max(0.0, snoise(vec3(flowField.x + t, flowField.y - t * 0.6, t * 0.7)));
  float swell = snoise(vec3(uv * vec2(1.3, 1.7) + vec2(-t * 0.5, t * 0.35), 7.0 + t * 0.4)) * 0.5 + 0.5;
  float incline = uv.x * uIncline;
  float lean = incline * mix(-0.25, 0.25, uv.y);
  float ripple = sin(uTime * 0.38 + position.x * 1.2 + position.y * 0.8) * 0.14;

  // Курсор притискає ділянку до камери.
  vec2 fromMouse = uv - uMouse;
  float push = smoothstep(uPushRadius * uPushRadius, 0.0, dot(fromMouse, fromMouse)) * uPushStrength;

  vec3 displaced = vec3(position.xy, position.z + hills * uElevation + swell * swell * uElevation * 0.55 + incline + lean + ripple + push);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(displaced, 1.0);

  // Колір: два шари шуму змішують палітру.
  vColor = uPalette[2];
  for (int i = 0; i < 2; i++) {
    float seed = 1.0 + float(i) * 8.0;
    float ceil = 0.6 + float(i) * 0.07;
    float mixer = smoothstep(0.1, ceil, snoise(vec3(field.x + uTime * 0.02, field.y, uTime * uColorSpeed + seed)));
    vColor = mix(vColor, uPalette[i], mixer);
  }

  // Згини: де хвиля піднімає сітку (пагорби) і де її притискає курсор, лінії ледь жевріють білим.
  float bend = smoothstep(0.12, 0.85, hills) + push / max(uPushStrength, 0.0001) * 0.6;
  vColor = mix(vColor, uBendColor, clamp(bend, 0.0, 1.0) * uBendGlow);

  // Світлий «промінь» повільно пливе по сітці по діагоналі: показує, що поверхня рухається.
  float sweepBand = pow(0.5 + 0.5 * sin(uv.x * 3.2 - uv.y * 2.1 - uTime * 0.3), 6.0);
  vColor = mix(vColor, uBendColor, sweepBand * uSweep);

  // Слід курсора підсвічує лінії.
  float glow = 0.0;
  for (int i = 0; i < ${TRAIL_MAX}; i++) {
    float live = step(float(i), float(uTrailCount) - 0.5);
    vec2 d = uv - uTrailPos[i];
    glow += live * smoothstep(uTrailRadius * uTrailRadius, 0.0, dot(d, d)) * uTrailAlpha[i];
  }
  vColor = mix(vColor, uTrailColor, clamp(glow, 0.0, 1.0));
}
`;

const FRAGMENT = /* glsl */ `
uniform float uCells;
uniform float uStrength;
varying vec3 vColor;
varying vec2 vUv;

// Лінія з м'яким краєм (≈1.5 px). Жорсткий 1-px край на перспективній, хвилястій сітці дає
// обриви ліній і мерехтіння, схоже на завади старого телевізора.
float lineMask(float distPx, float halfWidthPx) {
  return 1.0 - smoothstep(halfWidthPx - 0.75, halfWidthPx + 0.75, distPx);
}

void main() {
  vec2 cell = vUv * uCells;
  vec2 cellPerPx = fwidth(cell);

  vec2 box = abs(fract(cell - 0.5) - 0.5) / max(cellPerPx, vec2(1e-5));
  float diagonal = cell.x - cell.y;
  float diag = abs(fract(diagonal - 0.5) - 0.5) / max(fwidth(diagonal), 1e-5);

  float squares = max(lineMask(box.x, 0.75), lineMask(box.y, 0.75));
  // Діагоналі слабші: сітка читається як квадрати, а не як густа решітка.
  float diagonals = lineMask(diag, 0.7) * 0.45;
  float alpha = max(squares, diagonals);

  // Там, де клітинка на екрані менша за ~6 px (дальній край хвилі), лінії зливаються й дають муар: гасимо.
  float cellPx = 1.0 / max(max(cellPerPx.x, cellPerPx.y), 1e-5);
  alpha *= smoothstep(3.0, 8.0, cellPx);

  if (alpha < 0.01) discard;
  gl_FragColor = vec4(vColor, alpha * uStrength);
}
`;

export type GridSceneOptions = {
  /** Густота площини за кількістю сегментів, менше на слабких екранах. */
  segments: number;
  /** false: фон пасивний, без реакції на курсор (ні відтискання, ні сліду). */
  interactive?: boolean;
  /** Сторінки для читання (статті): ті самі форма й рух, але лінії тихіші, щоб текст домінував. */
  calm?: boolean;
};

export function createGridScene(canvas: HTMLCanvasElement, options: GridSceneOptions): GridSceneHandle {
  const interactive = options.interactive ?? true;
  const calm = options.calm ?? false;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  camera.position.set(0, 0, CAMERA_Z);

  // Палітра: нейтральні темно-сірі тони без кольорового відтінку, підсвітка слідом лише біла.
  // Пасивний фон без сліду курсора світліший: лінії самі мають бути видні, без підсвітки від руху.
  // Колір задано в лінійному просторі, де темні сірі майже нуль, тому множник такий великий.
  const lift = interactive ? 1 : 12;
  const palette = ["#1a1a1a", "#0d0d0d", "#242424", "#0d0d0d", "#141414"].map((hex) =>
    new THREE.Color(hex).multiplyScalar(lift),
  );
  const trailPositions = Array.from({ length: TRAIL_MAX }, () => new THREE.Vector2());
  const trailAlphas = new Float32Array(TRAIL_MAX);

  const uniforms = {
    uTime: { value: 0 },
    uPalette: { value: palette },
    uElevation: { value: interactive ? 0.65 : 1.25 },
    uSpeed: { value: interactive ? 0.12 : 0.075 },
    uIncline: { value: 0.6 },
    uColorSpeed: { value: interactive ? 0.35 : 0.1 },
    uSweep: { value: interactive ? 0 : calm ? 0.12 : 0.55 },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uPushRadius: { value: 0.25 },
    uPushStrength: { value: interactive ? 0.15 : 0 },
    uTrailCount: { value: 0 },
    uTrailPos: { value: trailPositions },
    uTrailAlpha: { value: trailAlphas },
    uTrailColor: { value: new THREE.Color("#ffffff").multiplyScalar(0.28) },
    uTrailRadius: { value: 0.06 },
    uBendColor: { value: new THREE.Color("#ffffff").multiplyScalar(0.3) },
    uBendGlow: { value: interactive ? 0.32 : calm ? 0.4 : 0.8 },
    uStrength: { value: calm ? 0.62 : 1 },
    uCells: { value: 80 },
  };

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    transparent: true,
    depthWrite: false,
  });

  let mesh: THREE.Mesh | null = null;
  let viewW = 1;
  let viewH = 1;
  let plane = 1;

  const build = () => {
    if (mesh) {
      mesh.geometry.dispose();
      scene.remove(mesh);
    }
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(plane, plane, options.segments, options.segments), material);
    scene.add(mesh);
  };

  const resize = (width: number, height: number) => {
    if (width < 1 || height < 1) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    viewH = 2 * CAMERA_Z * Math.tan((FOV * Math.PI) / 360);
    viewW = viewH * camera.aspect;
    plane = 1.5 * Math.max(viewW, viewH);
    // Клітинка має фіксований світовий розмір (≈16 px на екрані), а не фіксовану кількість на площину:
    // інакше на великому екрані вона стає дрібною, а лінії - шумом.
    uniforms.uCells.value = Math.round(plane / CELL_SIZE);
    build();
  };

  // Курсор: ціль для згладженого uMouse і слід точок.
  const targetMouse = new THREE.Vector2(0.5, 0.5);
  const trail: { uv: THREE.Vector2; born: number }[] = [];
  let lastStep = 0;
  let pending: MouseEvent | null = null;
  let pendingFrame = 0;

  const onMove = (event: MouseEvent) => {
    const now = performance.now();
    if (now - lastStep < TRAIL_STEP_MS) return;
    lastStep = now;
    pending = event;
    if (pendingFrame) return;
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0;
      const e = pending;
      pending = null;
      if (!e) return;
      const x = (e.clientX / window.innerWidth) * viewW - viewW / 2;
      const y = -((e.clientY / window.innerHeight) * viewH - viewH / 2);
      targetMouse.set(x / plane + 0.5, y / plane + 0.5);
      trail.push({ uv: targetMouse.clone(), born: performance.now() });
      if (trail.length > TRAIL_CAP) trail.splice(0, trail.length - TRAIL_CAP);
    });
  };
  if (interactive) window.addEventListener("mousemove", onMove);

  const clock = new THREE.Clock();
  let frame = 0;
  let active = true;
  let firstFrame = true;

  const render = () => {
    frame = 0;
    if (!active || document.hidden) return;

    const now = performance.now();
    while (trail.length > 0 && now - trail[0].born > TRAIL_LIFETIME_MS) trail.shift();
    // Як на референсі: у шейдер потрапляють лише 10 НАЙСТАРІШИХ живих точок. Поки курсор рухається
    // безперервно, підсвітка йде за ним із затримкою й швидко згасає, а не світиться постійно.
    const live = trail.slice(0, TRAIL_MAX);
    uniforms.uTrailCount.value = live.length;
    for (let index = 0; index < TRAIL_MAX; index++) {
      const point = live[index];
      if (point) {
        const age = Math.min(1, (now - point.born) / TRAIL_LIFETIME_MS);
        trailPositions[index].copy(point.uv);
        trailAlphas[index] = (1 - age) * (1 - age);
      } else {
        trailPositions[index].set(0, 0);
        trailAlphas[index] = 0;
      }
    }

    uniforms.uTime.value = clock.getElapsedTime();
    uniforms.uMouse.value.lerp(targetMouse, 0.05);
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      canvas.dataset.ready = "true";
    }
    frame = requestAnimationFrame(render);
  };

  const start = () => {
    if (!frame && active && !document.hidden) frame = requestAnimationFrame(render);
  };
  const onVisibility = () => {
    if (document.hidden) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    } else start();
  };
  document.addEventListener("visibilitychange", onVisibility);
  start();

  return {
    resize: (width, height) => {
      resize(width, height);
      start();
    },
    setActive: (next) => {
      active = next;
      if (!next) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      } else start();
    },
    dispose: () => {
      if (frame) cancelAnimationFrame(frame);
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      mesh?.geometry.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
