import { describe, expect, it } from "vitest";
import { compileElasticsearchHybridQuery } from "../src/adapters/elasticsearch";
import {
  buildShopifyCartPermalink,
  normalizeShopifyProduct,
  verifyShopifyAppProxySignature,
} from "../src/adapters/shopify";
import { analyzeWardrobeGaps } from "../src/core/compatibility";
import { reciprocalRankFusion } from "../src/core/hybrid-search";
import { SAMPLE_WARDROBE } from "../src/data/sample-data";

describe("Elasticsearch hybrid RRF query compiler", () => {
  it("emits native retriever.rrf DSL when queryEmbedding is supplied", () => {
    const gapReport = analyzeWardrobeGaps(SAMPLE_WARDROBE, "fall");
    const dsl = compileElasticsearchHybridQuery({
      query: "olive linen overshirt",
      gapReport,
      maxPriceUsd: 250,
      targetSeason: "fall",
      queryEmbedding: [0.8, 0.4, 0.2, 0.1],
    }) as {
      retriever: { rrf: { retrievers: unknown[]; rank_constant: number } };
    };

    expect(dsl.retriever.rrf.rank_constant).toBe(60);
    expect(dsl.retriever.rrf.retrievers).toHaveLength(2);
  });

  it("fuses multiple ranked lists via Reciprocal Rank Fusion", () => {
    const fused = reciprocalRankFusion([
      {
        docs: [
          { id: "a", score: 10 },
          { id: "b", score: 5 },
        ],
      },
      {
        docs: [
          { id: "b", score: 0.9 },
          { id: "c", score: 0.8 },
        ],
      },
    ]);
    // "b" appears in both lists, so it outranks single-list items.
    expect((fused.get("b") ?? 0) > (fused.get("a") ?? 0)).toBe(true);
    expect((fused.get("b") ?? 0) > (fused.get("c") ?? 0)).toBe(true);
  });
});

describe("Shopify Storefront & App Proxy adapter", () => {
  it("normalizes Storefront GraphQL nodes and builds cart permalinks", () => {
    const normalized = normalizeShopifyProduct({
      id: "gid://shopify/Product/99100",
      handle: "merino-cardigan",
      title: "Charcoal Merino Cardigan",
      description: "Fine-gauge wool cardigan.",
      productType: "outerwear",
      tags: ["knitwear", "layering"],
      priceRange: { minVariantPrice: { amount: "210.00" } },
      variants: { nodes: [{ id: "gid://shopify/ProductVariant/88200", availableForSale: true }] },
      metafields: [
        { key: "color_hex", value: "#3A3D42" },
        { key: "formality", value: "3" },
        { key: "seasons", value: "fall,winter" },
      ],
    });
    expect(normalized.id).toBe("99100");
    expect(normalized.shopifyVariantId).toBe("88200");
    expect(normalized.priceUsd).toBe(210);

    const url = buildShopifyCartPermalink("demo.myshopify.com", [
      { variantId: "gid://shopify/ProductVariant/88200", quantity: 1 },
    ]);
    expect(url).toBe("https://demo.myshopify.com/cart/88200:1");
  });

  it("verifies Shopify App Proxy HMAC-SHA256 signatures via Web Crypto", async () => {
    const secret = "test_shopify_shared_secret";
    const params = new URLSearchParams({
      shop: "demo-atelier.myshopify.com",
      timestamp: "1795620000",
      path_prefix: "/apps/wardrobe",
    });

    const canonical = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join("");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(canonical));
    const sigHex = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    params.set("signature", sigHex);
    expect(await verifyShopifyAppProxySignature(params, secret)).toBe(true);

    params.set("signature", "0".repeat(64));
    expect(await verifyShopifyAppProxySignature(params, secret)).toBe(false);
  });
});
