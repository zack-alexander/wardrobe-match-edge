import { describe, expect, it } from "vitest";
import { analyzeWardrobeGaps, evaluateMarginalUtility } from "../src/core/compatibility";
import { runWardrobeMatch } from "../src/core/engine";
import type { CatalogProduct } from "../src/types";
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

describe("marginal outfit identity", () => {
  it("counts Marginal Outfits Unlocked by garment id, not display name", () => {
    const gapReport = analyzeWardrobeGaps(SAMPLE_WARDROBE, "fall");
    const olive = SAMPLE_SHOPIFY_CATALOG[0];
    const baseline = evaluateMarginalUtility(SAMPLE_WARDROBE, olive, gapReport, "fall");

    // A SKU named exactly like an owned garment must not inherit its outfits.
    const nameCollision: CatalogProduct = { ...olive, id: "sku-dup-name", name: "White Oxford Shirt" };
    const collided = evaluateMarginalUtility(SAMPLE_WARDROBE, nameCollision, gapReport, "fall");

    expect(collided.marginalOutfitsUnlocked).toBe(baseline.marginalOutfitsUnlocked);
    expect(collided.sampleOutfits.every((o) => o.itemIds.includes("sku-dup-name"))).toBe(true);
    expect(baseline.sampleOutfits.every((o) => o.itemIds.includes(olive.id))).toBe(true);
  });
});
