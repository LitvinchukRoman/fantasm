import * as THREE from "three";

/**
 * Рідка маса ауры з інерцією. Зсув D має швидкість V і тягнеться назад пружиною з тертям: курсор
 * штовхає ауру, вона відхиляється, трохи перелітає й гасне, а розтікання сусідніх клітинок
 * (хвильовий звʼязок) розносить збурення, як по рідині. Окремо «діра» під курсором: вона швидко
 * заповнюється, бо вільний простір рідина займає одразу.
 *
 * field (півточність, лінійна фільтрація): R, G зсув у одиницях висоти екрана; B, A швидкість зсуву.
 * hole: R наскільки світло відтекло з цього місця, 0..1.
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Форма сплеску: стрілка вздовж руху. Спереду коротке гостре вістря, ззаду довгий хвіст, що
 * розширюється конусом. Радіальний гаусіан тут не годиться: від нього виходить кругла пляма.
 * Повертає вагу в x і знак боку (від осі руху) в y.
 */
const SPLAT_SHAPE = /* glsl */ `
uniform float aspect;
uniform vec2 point;
uniform vec2 dir;
uniform float stretch;
uniform float radius;

vec3 splatShape(vec2 uv) {
  vec2 p = uv - point;
  p.x *= aspect;
  float sig = sqrt(radius);
  vec2 perp = vec2(-dir.y, dir.x);
  float a = dot(p, dir);
  float c = dot(p, perp);
  float tail = sig * mix(1.0, 5.0, stretch);
  float behind = max(-a, 0.0);
  float ahead = max(a, 0.0);
  float along = exp(-behind / tail) * exp(-ahead * ahead / (2.0 * sig * sig * 0.35));
  float width = sig * (0.55 + 1.5 * behind / tail);
  float across = exp(-c * c / (2.0 * width * width));
  return vec3(along * across, c, a);
}
`;

const SPLAT_FIELD = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform float push;
uniform float dragAmount;
${SPLAT_SHAPE}
void main() {
  vec3 sh = splatShape(vUv);
  vec2 perp = vec2(-dir.y, dir.x);
  // Вздовж руху тягне, з боків розсуває: виходить стрілка, що відкриває простір перед собою.
  float side = clamp(sh.y / (sqrt(radius) * 0.8), -1.0, 1.0);
  vec2 force = (dir * dragAmount + perp * side * push) * sh.x;
  vec4 s = texture2D(uState, vUv);
  gl_FragColor = vec4(s.xy, s.zw + force);
}
`;

const SPLAT_HOLE = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform float clearing;
${SPLAT_SHAPE}
void main() {
  vec3 sh = splatShape(vUv);
  vec4 s = texture2D(uState, vUv);
  gl_FragColor = vec4(min(1.0, s.x + clearing * sh.x), 0.0, 0.0, 1.0);
}
`;

const RELAX_FIELD = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform vec2 texelSize;
uniform float dt;
uniform float spring;
uniform float damping;
uniform float wave;
uniform float diffuse;
uniform float maxShift;
uniform float maxSpeed;
void main() {
  vec4 c = texture2D(uState, vUv);
  vec4 avg = 0.25 * (
    texture2D(uState, vUv + vec2(texelSize.x, 0.0)) +
    texture2D(uState, vUv - vec2(texelSize.x, 0.0)) +
    texture2D(uState, vUv + vec2(0.0, texelSize.y)) +
    texture2D(uState, vUv - vec2(0.0, texelSize.y))
  );
  vec4 sm = mix(c, avg, diffuse);
  vec2 d = sm.xy;
  vec2 v = sm.zw;
  v += (-spring * d + wave * (avg.xy - c.xy) - damping * v) * dt;
  float vl = length(v);
  if (vl > maxSpeed) v *= maxSpeed / vl;
  d += v * dt;
  float dl = length(d);
  if (dl > maxShift) d *= maxShift / dl;
  gl_FragColor = vec4(d, v);
}
`;

const RELAX_HOLE = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uState;
uniform vec2 texelSize;
uniform float diffuse;
uniform float keep;
void main() {
  float c = texture2D(uState, vUv).x;
  float avg = 0.25 * (
    texture2D(uState, vUv + vec2(texelSize.x, 0.0)).x +
    texture2D(uState, vUv - vec2(texelSize.x, 0.0)).x +
    texture2D(uState, vUv + vec2(0.0, texelSize.y)).x +
    texture2D(uState, vUv - vec2(0.0, texelSize.y)).x
  );
  gl_FragColor = vec4(mix(c, avg, diffuse) * keep, 0.0, 0.0, 1.0);
}
`;

type Pair = {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  swap: () => void;
  dispose: () => void;
};

function makeTarget(width: number, height: number) {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function makePair(width: number, height: number): Pair {
  const pair: Pair = {
    read: makeTarget(width, height),
    write: makeTarget(width, height),
    swap() {
      const next = pair.read;
      pair.read = pair.write;
      pair.write = next;
    },
    dispose() {
      pair.read.dispose();
      pair.write.dispose();
    },
  };
  return pair;
}

export type FluidOptions = {
  /** Коротша сторона сітки в клітинках. */
  simSize: number;
  /** Жорсткість пружини, 1/с²: чим більша, тим швидше аура повертається. */
  spring: number;
  /** Тертя, 1/с: чим більше, тим менше перельоту. Критичне значення 2*sqrt(spring). */
  damping: number;
  /** Хвильовий звʼязок із сусідами: розносить збурення по масі. */
  wave: number;
  /** Розтікання за кадр 0..1. */
  diffuse: number;
  /** Скільки «діри» лишається через секунду: мало = рідина заповнює простір майже одразу. */
  holeKeepPerSecond: number;
  /** Радіус сплеску в квадраті, у одиницях висоти екрана. */
  splatRadius: number;
  /** Найбільший зсув, у одиницях висоти екрана. */
  maxShift: number;
  /** Найбільша швидкість зсуву, висот екрана за секунду. */
  maxSpeed: number;
};

export const FLUID_DEFAULTS: FluidOptions = {
  simSize: 96,
  spring: 14,
  damping: 5.5,
  wave: 140,
  diffuse: 0.12,
  holeKeepPerSecond: 0.06,
  splatRadius: 0.0035,
  maxShift: 0.2,
  maxSpeed: 2,
};

export function createFluid(renderer: THREE.WebGLRenderer, initial: Partial<FluidOptions> = {}) {
  const options: FluidOptions = { ...FLUID_DEFAULTS, ...initial };

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  scene.add(quad);

  const mat = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });

  const shapeUniforms = () => ({
    aspect: { value: 1 },
    point: { value: new THREE.Vector2() },
    dir: { value: new THREE.Vector2(1, 0) },
    stretch: { value: 0 },
    radius: { value: options.splatRadius },
  });
  const splatFieldMat = mat(SPLAT_FIELD, {
    uState: { value: null },
    push: { value: 0 },
    dragAmount: { value: 0 },
    ...shapeUniforms(),
  });
  const splatHoleMat = mat(SPLAT_HOLE, {
    uState: { value: null },
    clearing: { value: 0 },
    ...shapeUniforms(),
  });
  const relaxFieldMat = mat(RELAX_FIELD, {
    uState: { value: null },
    texelSize: { value: new THREE.Vector2(1, 1) },
    dt: { value: 1 / 60 },
    spring: { value: options.spring },
    damping: { value: options.damping },
    wave: { value: options.wave },
    diffuse: { value: options.diffuse },
    maxShift: { value: options.maxShift },
    maxSpeed: { value: options.maxSpeed },
  });
  const relaxHoleMat = mat(RELAX_HOLE, {
    uState: { value: null },
    texelSize: { value: new THREE.Vector2(1, 1) },
    diffuse: { value: 0.3 },
    keep: { value: 1 },
  });
  const materials = [splatFieldMat, splatHoleMat, relaxFieldMat, relaxHoleMat];

  let simW = 0;
  let simH = 0;
  let field: Pair | null = null;
  let hole: Pair | null = null;

  function run(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
  }

  /** Сітка з квадратними клітинками: коротша сторона = simSize. Вміст скидається, коли розмір змінився. */
  function resize(width: number, height: number) {
    const aspect = width / Math.max(1, height);
    const nextW = Math.max(16, Math.round(options.simSize * Math.max(1, aspect)));
    const nextH = Math.max(16, Math.round(options.simSize * Math.max(1, 1 / aspect)));
    if (nextW === simW && nextH === simH) return;
    simW = nextW;
    simH = nextH;
    field?.dispose();
    hole?.dispose();
    field = makePair(simW, simH);
    hole = makePair(simW, simH);
    relaxFieldMat.uniforms.texelSize.value.set(1 / simW, 1 / simH);
    relaxHoleMat.uniforms.texelSize.value.set(1 / simW, 1 / simH);
    splatFieldMat.uniforms.aspect.value = simW / simH;
    splatHoleMat.uniforms.aspect.value = simW / simH;
  }

  /**
   * x, y у 0..1 (екранний uv). dirX, dirY: напрям руху (будь-якої довжини), stretch 0..1: довжина хвоста.
   * dragAmount: імпульс уздовж руху, push: імпульс убік від осі, clearing: на скільки розсіяти світло.
   */
  function splat(
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    stretch: number,
    dragAmount: number,
    push: number,
    clearing: number,
  ) {
    if (!field || !hole) return;
    const length = Math.hypot(dirX, dirY);
    if (length < 1e-6) return;
    const previous = renderer.getRenderTarget();
    for (const m of [splatFieldMat, splatHoleMat]) {
      m.uniforms.point.value.set(x, y);
      m.uniforms.dir.value.set(dirX / length, dirY / length);
      m.uniforms.stretch.value = stretch;
    }
    splatFieldMat.uniforms.uState.value = field.read.texture;
    splatFieldMat.uniforms.dragAmount.value = dragAmount;
    splatFieldMat.uniforms.push.value = push;
    run(splatFieldMat, field.write);
    field.swap();

    splatHoleMat.uniforms.uState.value = hole.read.texture;
    splatHoleMat.uniforms.clearing.value = clearing;
    run(splatHoleMat, hole.write);
    hole.swap();
    renderer.setRenderTarget(previous);
  }

  function step(dt: number) {
    if (!field || !hole) return;
    const previous = renderer.getRenderTarget();
    const delta = Math.min(dt, 1 / 30);

    relaxFieldMat.uniforms.uState.value = field.read.texture;
    relaxFieldMat.uniforms.dt.value = delta;
    run(relaxFieldMat, field.write);
    field.swap();

    relaxHoleMat.uniforms.uState.value = hole.read.texture;
    relaxHoleMat.uniforms.keep.value = Math.pow(options.holeKeepPerSecond, delta);
    run(relaxHoleMat, hole.write);
    hole.swap();
    renderer.setRenderTarget(previous);
  }

  return {
    options,
    resize,
    splat,
    step,
    /** Зсув і швидкість (RGBA). Текстура міняється щокадру: читати через getter. */
    get fieldTexture() {
      return field?.read.texture ?? null;
    },
    /** Діра (R). */
    get holeTexture() {
      return hole?.read.texture ?? null;
    },
    dispose() {
      field?.dispose();
      hole?.dispose();
      for (const m of materials) m.dispose();
      quad.geometry.dispose();
    },
  };
}
