import { describe, expect, it } from "vitest";
import { hexToOKLab, hexToOKLCH, scoreColorHarmony } from "../src/core/oklab";

describe("OKLab perceptual color math", () => {
  it("maps pure white and pure black to expected OKLab lightness bounds", () => {
    const white = hexToOKLab("#FFFFFF");
    const black = hexToOKLab("#000000");
    expect(white.L).toBeCloseTo(1, 3);
    expect(black.L).toBeCloseTo(0, 3);
  });

  it("scores neutral anchors + earth tones significantly higher than clashing neon pairs", () => {
    const oliveAndStone = scoreColorHarmony("#5B6448", "#D4C8B4");
    const whiteAndNavy = scoreColorHarmony("#F5F5F0", "#213047");
    const neonAndMagenta = scoreColorHarmony("#C6FF00", "#FF00AA");

    expect(whiteAndNavy.relation).toBe("neutral-anchor");
    expect(whiteAndNavy.score).toBeGreaterThan(0.88);
    expect(oliveAndStone.score).toBeGreaterThan(0.8);
    expect(oliveAndStone.score).toBeGreaterThan(neonAndMagenta.score);
  });

  it("identifies low-chroma shades accurately in OKLCH", () => {
    const charcoal = hexToOKLCH("#383B40");
    const neonLime = hexToOKLCH("#C6FF00");
    expect(charcoal.C).toBeLessThan(0.03);
    expect(neonLime.C).toBeGreaterThan(0.18);
  });
});
