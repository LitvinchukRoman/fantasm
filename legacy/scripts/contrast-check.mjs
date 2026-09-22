// WCAG contrast audit for the OKLCH design tokens.
// Converts OKLCH -> OKLab -> linear sRGB -> luminance and checks key pairs.
// Run: node scripts/contrast-check.mjs

function oklchToLinear(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const clamp = (x) => Math.min(1, Math.max(0, x));
function luminance([r, g, b]) {
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}
// alpha-composite a foreground OKLCH (with alpha) over an opaque bg (linear)
function over(fgLin, aFg, bgLin) {
  return fgLin.map((c, i) => clamp(c) * aFg + bgLin[i] * (1 - aFg));
}
function contrast(fg, bg) {
  const L1 = luminance(fg), L2 = luminance(bg);
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}
const O = (L, C, h) => oklchToLinear(L, C, h);

const themes = {
  light: {
    bg: O(0.985, 0.006, 85),
    "surface-1": O(1, 0, 0),
    "surface-2": O(0.972, 0.007, 85),
    ink: O(0.22, 0.02, 265),
    "ink-2": O(0.42, 0.02, 265),
    "ink-3": O(0.56, 0.015, 265),
    "accent-ink": O(0.52, 0.12, 62),
    "accent-contrast": O(0.24, 0.04, 66),
    accent: O(0.77, 0.15, 74),
    seal: O(0.62, 0.13, 66),
    danger: O(0.55, 0.17, 25),
    "btn-primary-bg": O(0.22, 0.02, 265),
    "btn-primary-fg": O(0.99, 0, 0),
  },
  dark: {
    bg: O(0.16, 0.016, 265),
    "surface-1": O(0.2, 0.016, 265),
    "surface-2": O(0.24, 0.017, 265),
    ink: O(0.96, 0.005, 85),
    "ink-2": O(0.79, 0.01, 85),
    "ink-3": O(0.64, 0.012, 265),
    "accent-ink": O(0.85, 0.13, 80),
    "accent-contrast": O(0.2, 0.03, 70),
    accent: O(0.82, 0.15, 78),
    seal: O(0.82, 0.13, 78),
    danger: O(0.7, 0.16, 25),
    "btn-primary-bg": O(0.82, 0.15, 78),
    "btn-primary-fg": O(0.2, 0.03, 70),
  },
};

// [fg, bg, minRatio, label]  (3.0 = large text / UI, 4.5 = normal text)
const checks = [
  ["ink", "bg", 4.5, "body text on bg"],
  ["ink", "surface-1", 4.5, "text on card"],
  ["ink", "surface-2", 4.5, "text on surface-2"],
  ["ink-2", "bg", 4.5, "secondary text on bg"],
  ["ink-2", "surface-1", 4.5, "secondary text on card"],
  ["ink-3", "bg", 3.0, "muted/caption (large) on bg"],
  ["ink-3", "surface-1", 3.0, "muted/caption (large) on card"],
  ["accent-ink", "bg", 4.5, "link text on bg"],
  ["accent-ink", "surface-1", 4.5, "link text on card"],
  ["seal", "bg", 3.0, "seal mark on bg (UI)"],
  ["danger", "surface-1", 4.5, "danger text on card"],
  ["btn-primary-fg", "btn-primary-bg", 4.5, "primary button label"],
];
// Accent-fill checks (ink text on amber fill button/chip)
const fillChecks = [["accent-contrast", "accent", 4.5, "ink on amber fill"]];

let fail = 0;
for (const [theme, t] of Object.entries(themes)) {
  console.log(`\n=== ${theme.toUpperCase()} ===`);
  for (const [fg, bg, min, label] of [...checks, ...fillChecks]) {
    const r = contrast(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) fail++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${r.toFixed(2)}:1  (min ${min})  ${label}  [${fg} / ${bg}]`
    );
  }
}
console.log(`\n${fail === 0 ? "ALL PASS" : fail + " FAILURES"}`);
process.exit(fail === 0 ? 0 : 1);
