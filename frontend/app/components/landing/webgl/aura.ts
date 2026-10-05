import * as THREE from "three";
import { SIMPLEX_NOISE_3D_GLSL } from "./simplex-noise.glsl";

/**
 * Аура: мʼяке об'ємне сяйво навколо сфери без частинок і без блиску. Один повноекранний квад,
 * усе рахує фрагментний шейдер. Орієнтир: секція Sidekick на shopify.com/editions/spring2026.
 *
 *   1. Промені. Шум у полярних координатах: кут береться через коло (cos, sin), тож шов відсутній,
 *      а вздовж радіуса шум змінюється повільно, тому промені видовжені від сфери.
 *   2. Динаміка в спокої: промені обертаються, шум тече вздовж радіуса, по ауре біжать хвилі,
 *      а ореол пульсує (як `uNoiseSpeed` і `uMiddleFadePulse` у референсі).
 *   3. Огинаюча: широкий ореол плюс згасання на ~2 радіуси, щоб аура розчинялась у фоні.
 *   4. Колір в одній гамі акценту `#ff6363`: винний, акцент, корал.
 *   5. Мишка розсуває ауру, як в'язку масу (fluid.ts): вміст відсувається від курсора, зона під ним
 *      світліє менш яскраво, а потім усе повільно, без коливань, повертається в рівновагу.
 */
export function createAura() {
  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2(1.2, 0.02) },
    uViewHalf: { value: new THREE.Vector2(3.2, 2) },
    /** Радіус сфери у світових одиницях (з урахуванням масштабу). */
    uRadius: { value: 2.45 },
    /** Одиничний вектор потоку в площині екрана: куди аура розтягнута сильніше. */
    uFlow: { value: new THREE.Vector2(-1, 0.25) },
    /** Загальна яскравість. 0 вимикає ауру. */
    uStrength: { value: 1 },
    uAccent: { value: new THREE.Color("#ff6363") },
    /** Зсув ауры від курсора (fluid.ts): RG у висотах екрана. */
    uFluid: { value: null as THREE.Texture | null },
    /** Діра під курсором (fluid.ts): R 0..1. */
    uHole: { value: null as THREE.Texture | null },
    /** Наскільки сильно аура розступається й розсіюється під курсором. 0 вимикає. */
    uFluidAmount: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      varying vec2 vNdc;
      void main() {
        vNdc = position.xy;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      uniform float uTime;
      uniform vec2 uCenter;
      uniform vec2 uViewHalf;
      uniform float uRadius;
      uniform vec2 uFlow;
      uniform float uStrength;
      uniform vec3 uAccent;
      uniform sampler2D uFluid;
      uniform sampler2D uHole;
      uniform float uFluidAmount;
      varying vec2 vNdc;

      ${SIMPLEX_NOISE_3D_GLSL}

      // Один шар променів: кут через коло (шов відсутній), вздовж радіуса шум змінюється повільно.
      // detail = 0 прибирає другу октаву, коли шар далекий і розмитий.
      float rayLayer(vec2 p, float freq, float radial, float spinRate, float flowRate, float seed, float detail, float contrast, float t) {
        float r = length(p);
        float spin = atan(p.y, p.x) + t * spinRate;
        vec2 cir = vec2(cos(spin), sin(spin));
        float n1 = snoise(vec3(cir * freq, r * radial - t * flowRate + seed));
        float n2 = detail > 0.0 ? snoise(vec3(cir * freq * 2.2 + 5.0, r * radial * 1.8 + t * flowRate * 1.4 + seed)) : 0.0;
        return pow(clamp(0.5 + 0.55 * n1 + 0.3 * detail * n2, 0.03, 0.95), contrast);
      }

      // Огинаюча шару: мʼякий вхід з-під сфери й згасання вдалину.
      float bodyEnvelope(float r, float reach) {
        return exp(-max(r - reach, 0.0) * 0.8) * smoothstep(0.4, reach, r);
      }

      void main() {
        vec2 q = (vNdc * uViewHalf - uCenter) / uRadius;
        float t = uTime;

        // Відгук на курсор: зсув у висотах екрана -> одиниці радіуса сфери, плюс розсіяна зона.
        vec2 suv = vNdc * 0.5 + 0.5;
        vec2 fl = texture2D(uFluid, suv).xy;
        vec2 shift = fl * (2.0 * uViewHalf.y / uRadius) * uFluidAmount;
        float cleared = smoothstep(0.0, 1.0, texture2D(uHole, suv).x) * uFluidAmount;

        // Простір: три шари на різній глибині. Ближній більший, різкіший, швидший і зсувається
        // курсором сильніше; дальній менший, мʼякший, глибшого кольору й майже не зсувається.
        // Різниця зсувів дає паралакс, а перекриття шарів дає обʼєм.
        vec2 pMid = q - shift;
        vec2 pNear = (q - shift * 1.7) * 0.82;
        vec2 pFar = (q - shift * 0.5) * 1.3;

        float rMid = length(pMid);
        float rNear = length(pNear);
        float rFar = length(pFar);

        float raysFar = rayLayer(pFar, 1.0, 0.35, 0.025, 0.05, 11.0, 0.0, 1.0, t);
        float raysMid = rayLayer(pMid, 1.35, 0.5, 0.05, 0.09, 0.0, 1.0, 1.5, t);
        float raysNear = rayLayer(pNear, 2.0, 0.65, 0.075, 0.14, 23.0, 1.0, 2.2, t);

        float bodyFar = bodyEnvelope(rFar, 1.7);
        float bodyMid = bodyEnvelope(rMid, 1.45);
        float bodyNear = bodyEnvelope(rNear, 1.3) * smoothstep(0.7, 1.8, rNear);

        // Кольоровий шум і повільна течія вздовж радіуса (спільні для шарів).
        float n3 = snoise(vec3(normalize(pMid + 0.0001) * 0.9 - 3.0, t * 0.06));
        float wave = 0.5 + 0.5 * sin(rMid * 2.6 - t * 0.35 + n3 * 1.2);

        // Один бік аури трохи сильніший: повільний вітер, що поволі гойдається.
        vec2 dir = pMid / max(rMid, 0.001);
        vec2 flow = normalize(uFlow + 0.35 * vec2(sin(t * 0.09), cos(t * 0.07)));
        float wind = 0.76 + 0.24 * dot(dir, flow);

        float pulse = 0.93 + 0.07 * sin(t * 0.5);
        float halo = 0.4 * exp(-rMid * 0.6) * (0.94 + 0.06 * sin(t * 0.4 + rMid));

        float lFar = bodyFar * raysFar;
        float lMid = bodyMid * raysMid * (0.92 + 0.16 * wave);
        float lNear = bodyNear * raysNear;
        float h = (halo + (0.3 * lFar + 0.7 * lMid + 0.75 * lNear) * wind) * pulse;
        // Під курсором світло лише трохи слабшає: головне враження дає деформація, а не затемнення.
        h *= 1.0 - 0.18 * cleared;

        // Колір у гамі акценту: дальні шари глибші й винніші, ближні тепліші й світліші.
        vec3 wine = vec3(0.24, 0.025, 0.08);
        vec3 coral = vec3(1.0, 0.62, 0.55);
        float level = clamp(h * 1.15, 0.0, 1.0);
        float depthMix = clamp((lNear * 0.42 - lFar * 0.38) / max(h, 0.05) * 0.8 + 0.5, 0.0, 1.0);
        vec3 c = mix(wine, uAccent, smoothstep(0.08, 0.55, level));
        c = mix(c, coral, smoothstep(0.5, 1.0, level) * 0.5);
        c = mix(c * vec3(0.8, 0.7, 0.95), c * vec3(1.1, 1.05, 1.0), depthMix);
        c += vec3(0.07, -0.03, 0.06) * n3;

        vec3 color = c * pow(h, 1.1) * 1.7;

        // Над сферою аура трохи слабша, але не зникає: сфера має купатися в тому ж світлі.
        color *= mix(0.6, 1.0, smoothstep(0.7, 1.4, rMid));
        // Далеко від сфери розчиняється повністю.
        color *= 1.0 - smoothstep(2.6, 3.9, rMid);

        color = 0.62 * (1.0 - exp(-color * 2.0));
        gl_FragColor = vec4(color * uStrength, 1.0);
      }
    `,
  });

  const geometry = new THREE.PlaneGeometry(2, 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;

  return {
    mesh,
    uniforms,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
}
