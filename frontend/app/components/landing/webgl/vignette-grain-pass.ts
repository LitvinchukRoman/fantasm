import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

/**
 * Vignette + film grain в один прохід. Параметри (amount/radius/softness)
 * навмисно взяті з реального конфіга Shopify Editions (vignetteAmount: .5,
 * vignetteRadius: .895, vignetteSoftness: .441, знайдено в їхньому
 * sectionModels-*.js під час інспекції живої сторінки) — це та частина
 * "власного рендерера", де ми свідомо відтворюємо їхні числа, бо сам шейдер
 * тривіальний і не є їхньою інтелектуальною власністю.
 */
export function createVignetteGrainPass({
  amount = 0.5,
  radius = 0.895,
  softness = 0.441,
  grainAmount = 0.035,
} = {}) {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uAmount: { value: amount },
      uRadius: { value: radius },
      uSoftness: { value: softness },
      uGrainAmount: { value: grainAmount },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uAmount;
      uniform float uRadius;
      uniform float uSoftness;
      uniform float uGrainAmount;
      uniform float uTime;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(41.3, 289.1)) + uTime * 0.7) * 43758.5453);
      }

      void main() {
        vec4 color = texture2D(tDiffuse, vUv);

        vec2 centered = vUv - 0.5;
        float dist = length(centered) * 1.4142; // нормалізація до кута кадру
        float vignette = 1.0 - uAmount * smoothstep(uRadius - uSoftness, uRadius, dist);
        color.rgb *= vignette;

        float grain = (hash(gl_FragCoord.xy) - 0.5) * uGrainAmount;
        color.rgb += grain;

        gl_FragColor = color;
      }
    `,
  });
}
