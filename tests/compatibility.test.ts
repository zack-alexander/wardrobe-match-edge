import { describe, expect, it } from "vitest";
import { analyzeWardrobeGaps } from "../src/core/compatibility";
import { runWardrobeMatch } from "../src/core/engine";
import { SAMPLE_SHOPIFY_CATALOG, SAMPLE_WARDROBE } from "../src/data/sample-data";

describe("wardrobe gap analysis & Marginal Outfits Unlocked", () => {
  it("detects missing fall outerwear gap in the sample closet", () => {
    const report = analyzeWardrobeGaps(SAMPLE_WARDROBE, "fall");
    expect(report.slotCounts.outerwear).toBe(0);
    expect(report.existingValidOutfits).toBeGreaterThan(0);
    expect(report.gaps.some((g) => g.slot === "outerwear" && g.season === "fall")).toBe(true);
  });

  it("ranks versatile smart-casual outerwear above clashing athletic outerwear", () => {
    const match = runWardrobeMatch(
      { wardrobe: SAMPLE_WARDROBE, targetSeason: "fall" },
      SAMPLE_SHOPIFY_CATALOG,
    );
    expect(match.results.length).toBeGreaterThanOrEqual(3);
    expect(match.results[0].product.slot).toBe("outerwear");
    expect(match.results[0].marginalOutfitsUnlocked).toBeGreaterThanOrEqual(6);
    expect(match.results[0].fillsGaps.length).toBeGreaterThan(0);

    // Formality-1 neon windbreaker is incompatible with formality 3-4 closet and fall season.
    expect(match.results.find((r) => r.product.id === "sku-neon-track-jacket")).toBeUndefined();
  });

  it("respects maxPriceUsd ceiling and generates Shopify cart permalinks", () => {
    const match = runWardrobeMatch(
      { wardrobe: SAMPLE_WARDROBE, maxPriceUsd: 200 },
      SAMPLE_SHOPIFY_CATALOG,
      "atelier.myshopify.com",
    );
    expect(match.results.every((r) => r.product.priceUsd <= 200)).toBe(true);
    expect(match.results[0].shopifyCartUrl).toContain(
      "https://atelier.myshopify.com/cart/44100291841:1",
    );
  });
});
