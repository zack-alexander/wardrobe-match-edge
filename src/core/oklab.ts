/**
 * Perceptual color space conversion (sRGB -> Linear RGB -> OKLab -> OKLCH)
 * following Bjorn Ottosson's OKLab specification, plus garment color harmony scoring.
 */

export interface OKLab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export interface OKLCH {
  readonly L: number;
  readonly C: number;
  /** Hue angle in degrees [0, 360). */
  readonly h: number;
}

export type HarmonyRelation =
  | "neutral-anchor"
  | "monochrome-tonal"
  | "analogous"
  | "complementary"
  | "triadic"
  | "clashing";

export interface HarmonyResult {
  readonly score: number;
  readonly relation: HarmonyRelation;
  readonly deltaE: number;
}

function srgbChannelToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function parseHexColor(hex: string): readonly [number, number, number] {
  const cleaned = hex.trim().replace(/^#/, "");
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color: "${hex}"`);
  }
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

export function hexToOKLab(hex: string): OKLab {
  const [r8, g8, b8] = parseHexColor(hex);
  const r = srgbChannelToLinear(r8);
  const g = srgbChannelToLinear(g8);
  const b = srgbChannelToLinear(b8);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return {
    L: 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    a: 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    b: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  };
}

export function hexToOKLCH(hex: string): OKLCH {
  const lab = hexToOKLab(hex);
  const C = Math.hypot(lab.a, lab.b);
  const h = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { L: lab.L, C, h };
}

export function oklabDistance(a: OKLab, b: OKLab): number {
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

function circularHueDiff(h1: number, h2: number): number {
  const raw = Math.abs(h1 - h2) % 360;
  return raw > 180 ? 360 - raw : raw;
}

/**
 * Score perceptual outfit color harmony between two garments in [0, 1].
 * Neutrals (low chroma in OKLCH) anchor saturated pieces naturally;
 * chromatic pairs are scored by lightness contrast + OKLCH hue geometry.
 */
export function scoreColorHarmony(hexA: string, hexB: string): HarmonyResult {
  const labA = hexToOKLab(hexA);
  const labB = hexToOKLab(hexB);
  const lchA = hexToOKLCH(hexA);
  const lchB = hexToOKLCH(hexB);
  const deltaE = oklabDistance(labA, labB);
  const lightnessContrast = Math.abs(lchA.L - lchB.L);

  const aNeutral = lchA.C < 0.045;
  const bNeutral = lchB.C < 0.045;

  if (aNeutral || bNeutral) {
    // Two near-identical neutrals can look flat; modest lightness separation reads sharper.
    const score = aNeutral && bNeutral ? 0.78 + Math.min(0.18, lightnessContrast * 0.45) : 0.92;
    return { score: Number(score.toFixed(3)), relation: "neutral-anchor", deltaE };
  }

  const hueDiff = circularHueDiff(lchA.h, lchB.h);

  if (hueDiff <= 18) {
    // Tonal monochrome works best when lightness separates the two pieces.
    const score = lightnessContrast >= 0.14 ? 0.88 : 0.68;
    return { score, relation: "monochrome-tonal", deltaE };
  }

  if (hueDiff <= 45) {
    return { score: 0.84, relation: "analogous", deltaE };
  }

  if (Math.abs(hueDiff - 180) <= 28) {
    // Complementary hues look refined when at least one piece isn't neon-saturated.
    const maxChroma = Math.max(lchA.C, lchB.C);
    const score = maxChroma <= 0.16 ? 0.87 : 0.74;
    return { score, relation: "complementary", deltaE };
  }

  if (Math.abs(hueDiff - 120) <= 20) {
    const maxChroma = Math.max(lchA.C, lchB.C);
    const score = maxChroma <= 0.14 ? 0.78 : 0.62;
    return { score, relation: "triadic", deltaE };
  }

  // High-chroma off-angle pairs clash unless muted.
  const avgChroma = (lchA.C + lchB.C) / 2;
  const score = avgChroma < 0.09 ? 0.72 : 0.42;
  return { score, relation: avgChroma < 0.09 ? "analogous" : "clashing", deltaE };
}
