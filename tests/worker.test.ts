import { describe, expect, it } from "vitest";
import { SAMPLE_WARDROBE } from "../src/data/sample-data";
import worker from "../src/worker";

describe("Cloudflare Worker / Vercel Edge fetch handler", () => {
  it("returns live wardrobe match demo on GET /", async () => {
    const res = await worker.fetch(new Request("https://edge.example.com/"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      service: string;
      demo: { topMatches: { marginalOutfitsUnlocked: number }[] };
    };
    expect(body.service).toBe("wardrobe-match-edge");
    expect(body.demo.topMatches[0].marginalOutfitsUnlocked).toBeGreaterThan(0);
  });

  it("handles POST /v1/match and returns Elasticsearch DSL + ranked matches", async () => {
    const res = await worker.fetch(
      new Request("https://edge.example.com/v1/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wardrobe: SAMPLE_WARDROBE,
          query: "linen overshirt",
          targetSeason: "fall",
          queryEmbedding: [0.8, 0.4, 0.3, 0.15],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      results: { product: { id: string } }[];
      elasticsearchQuery: { retriever?: { rrf?: unknown } };
    };
    expect(data.results[0].product.id).toBe("sku-olive-overshirt");
    expect(data.elasticsearchQuery.retriever?.rrf).toBeDefined();
  });

  it("returns interactive HTML Edge Playground when Accept includes text/html", async () => {
    const res = await worker.fetch(
      new Request("https://edge.example.com/", { headers: { Accept: "text/html" } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("Marginal Outfits Unlocked");
    expect(html).toContain("retriever.rrf");
  });

  it("rejects unsigned Shopify App Proxy requests when SHOPIFY_APP_SECRET is bound", async () => {
    const res = await worker.fetch(
      new Request("https://edge.example.com/v1/shopify/proxy?shop=demo.myshopify.com"),
      { SHOPIFY_APP_SECRET: "live_secret" },
    );
    expect(res.status).toBe(401);
  });
});
