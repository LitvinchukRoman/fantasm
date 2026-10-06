import * as THREE from "three";
import { SIMPLEX_NOISE_3D_GLSL } from "./simplex-noise.glsl";

/**
 * Сфера з точок замість терасованого "холму". Форма і рух повторюють
 * секцію Operations на shopify.com/editions/spring2026: щільна оболонка,
 * трохи об'єму всередині, яскрава "шапка" з одного боку, повільне
 * обертання. Кольори замінені на raycast-палітру (білий, #D8D8D8, холодний
 * графіт) замість їхнього райдужного золота/зелені/фіолету.
 */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPHERE_RADIUS = 2.45;
/** Видимий розмір сфери відносно ауры: пил трохи менший за радіус, від якого рахується аура. */
const SPHERE_SHRINK = 0.88;
const SHELL_COUNT = 52000;
const VOLUME_COUNT = 16000;
const CAP_COUNT = 3500;

export function createSpherePointCloud() {
  const rand = mulberry32(1337);
  const count = SHELL_COUNT + VOLUME_COUNT + CAP_COUNT;
  const positions = new Float32Array(count * 3);
  const shell = new Float32Array(count);
  /** 1 для точок «шапки»: на вузькому екрані їх ховаємо, щоб куля була однорідна. */
  const cap = new Float32Array(count);

  const light = new THREE.Vector3(0.22, 0.48, 0.85).normalize();
  let i = 0;

  const push = (x: number, y: number, z: number, shellFactor: number, capFactor = 0) => {
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    shell[i] = shellFactor;
    cap[i] = capFactor;
    i++;
  };

  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let n = 0; n < SHELL_COUNT; n++) {
    const y = 1 - (n / (SHELL_COUNT - 1)) * 2;
    const theta = golden * n;
    const jitter = 0.94 + rand() * 0.08;
    const r = SPHERE_RADIUS * jitter;
    const thetaJ = theta + (rand() - 0.5) * 0.35;
    const yJ = Math.max(-1, Math.min(1, y + (rand() - 0.5) * 0.015));
    const ringJ = Math.sqrt(Math.max(0, 1 - yJ * yJ));
    push(Math.cos(thetaJ) * ringJ * r, yJ * r, Math.sin(thetaJ) * ringJ * r, 1);
  }

  for (let n = 0; n < VOLUME_COUNT; n++) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const radial = SPHERE_RADIUS * Math.pow(rand(), 0.42);
    push(
      Math.sin(phi) * Math.cos(theta) * radial,
      Math.cos(phi) * radial,
      Math.sin(phi) * Math.sin(theta) * radial,
      0.35 + (radial / SPHERE_RADIUS) * 0.5,
    );
  }

  for (let n = 0; n < CAP_COUNT; n++) {
    const spread = (rand() - 0.5) * 0.55;
    const dir = light
      .clone()
      .add(new THREE.Vector3(spread, (rand() - 0.5) * 0.55, (rand() - 0.5) * 0.35))
      .normalize();
    const radial = SPHERE_RADIUS * (0.9 + rand() * 0.1);
    dir.multiplyScalar(radial);
    push(dir.x, dir.y, dir.z, 1, 1);
  }

  // Перемішуємо точки, щоб `setDrawRange(0, n)` давав рівномірно рідшу сферу, а не відрізав
  // «шапку» чи об'єм. Так якість можна знижувати на льоту (мобільні, слабка відеокарта).
  for (let n = count - 1; n > 0; n--) {
    const m = Math.floor(rand() * (n + 1));
    for (let k = 0; k < 3; k++) {
      const t = positions[n * 3 + k];
      positions[n * 3 + k] = positions[m * 3 + k];
      positions[m * 3 + k] = t;
    }
    const ts = shell[n];
    shell[n] = shell[m];
    shell[m] = ts;
    const tc = cap[n];
    cap[n] = cap[m];
    cap[m] = tc;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aShell", new THREE.BufferAttribute(shell, 1));
  geometry.setAttribute("aCap", new THREE.BufferAttribute(cap, 1));

  const uniforms = {
    uTime: { value: 0 },
    uPointSize: { value: 1.45 },
    /** Масштаб сфери: на вузьких екранах менший, щоб сфера вміщалась у кадр. */
    uScale: { value: 1 },
    uPixelRatio: { value: 1 },
    /** 1 на широкому екрані. На вузькому 0: світла немає взагалі, вся куля однієї яскравості без плями. */
    uLightAmount: { value: 1 },
    /** 1 на широкому екрані. 0 на вузькому: точки «шапки» не малюються, густина по кулі рівна. */
    uCapAmount: { value: 1 },
    uViewHalf: { value: new THREE.Vector2(3.2, 2) },
    uCenter: { value: new THREE.Vector2(1.15, 0.05) },
    /** Зсув від курсора (fluid.ts, RG у висотах екрана) і діра під ним (R). */
    uFluid: { value: null as THREE.Texture | null },
    uHole: { value: null as THREE.Texture | null },
    uColorLow: { value: new THREE.Color("#d9b4b2") },
    uColorMid: { value: new THREE.Color("#ecd0cc") },
    uColorHigh: { value: new THREE.Color("#fff3f0") },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aShell;
      attribute float aCap;
      uniform float uTime;
      uniform float uPointSize;
      uniform float uScale;
      uniform float uPixelRatio;
      uniform float uLightAmount;
      uniform float uCapAmount;
      uniform vec2 uViewHalf;
      uniform vec2 uCenter;
      uniform sampler2D uFluid;
      uniform sampler2D uHole;
      varying float vLight;
      varying float vAlpha;

      ${SIMPLEX_NOISE_3D_GLSL}

      vec3 rotateY(vec3 p, float a) {
        float c = cos(a);
        float s = sin(a);
        return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
      }

      void main() {
        float spin = uTime * 0.11;
        vec3 p = rotateY(position * uScale * ${SPHERE_SHRINK.toFixed(3)}, spin);
        float wobble = snoise(p * 1.35 + vec3(0.0, uTime * 0.17, 0.2));
        p += normalize(p + vec3(0.0001)) * wobble * 0.04;

        vec3 world = p + vec3(uCenter, 0.0);

        vec3 nrm = normalize(p);

        float ndl = pow(max(dot(nrm, normalize(vec3(0.28, 0.18, 0.94))), 0.0), 1.55);
        // Вузький екран: стискаємо діапазон світла до середини, щоб центр шапки не вигорав.
        vLight = mix(0.5, clamp(ndl, 0.0, 1.0), uLightAmount);
        // Край сфери м'якший: силует розчиняється в ауре, а не обрізається різкою межею.
        float facing = abs(nrm.z);
        vAlpha = aShell * (0.62 + 0.38 * vLight) * (0.5 + 0.5 * smoothstep(0.0, 0.55, facing));
        vAlpha *= mix(1.0, uCapAmount, aCap);

        vec4 mvPosition = modelViewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // Пил рухається разом із масою: зсув у висотах екрана -> NDC, з інерцією поля.
        vec2 suv = gl_Position.xy / gl_Position.w * 0.5 + 0.5;
        vec2 push = texture2D(uFluid, suv).xy;
        float aspect = uViewHalf.x / uViewHalf.y;
        gl_Position.xy += vec2(push.x * 2.0 / aspect, push.y * 2.0) * 1.3 * gl_Position.w;
        float holeDim = 1.0 - 0.12 * texture2D(uHole, suv).x;
        vAlpha *= holeDim;
        gl_PointSize = uPointSize * uPixelRatio * (0.65 + 1.35 * vLight);
      }
    `,
    fragmentShader: `
      uniform vec3 uColorLow;
      uniform vec3 uColorMid;
      uniform vec3 uColorHigh;
      varying float vLight;
      varying float vAlpha;

      void main() {
        vec2 centered = gl_PointCoord - vec2(0.5);
        float dist = length(centered);
        if (dist > 0.5) discard;

        float soft = smoothstep(0.5, 0.05, dist);
        vec3 color = mix(uColorLow, uColorMid, smoothstep(0.0, 0.4, vLight));
        color = mix(color, uColorHigh, smoothstep(0.62, 1.0, vLight));
        float alpha = soft * vAlpha;
        gl_FragColor = vec4(color * alpha, 1.0);
      }
    `,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.position.set(0, 0, 0);

  return { points, material, uniforms, radius: SPHERE_RADIUS, count };
}
