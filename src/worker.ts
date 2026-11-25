import { compileElasticsearchHybridQuery } from "./adapters/elasticsearch";
import { verifyShopifyAppProxySignature } from "./adapters/shopify";
import { analyzeWardrobeGaps } from "./core/compatibility";
import { runWardrobeMatch } from "./core/engine";
import { SAMPLE_SHOPIFY_CATALOG, SAMPLE_WARDROBE } from "./data/sample-data";
import { renderEdgePlaygroundHtml } from "./ui";
import type { MatchRequest, WorkerEnv } from "./types";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

const worker = {
  async fetch(request: Request, env: WorkerEnv = {}): Promise<Response> {
    const url = new URL(request.url);
    const storeDomain = env.DEFAULT_STORE_DOMAIN ?? "demo-atelier.myshopify.com";

    if (request.method === "GET" && url.pathname === "/") {
      const sample = runWardrobeMatch(
        {
          wardrobe: SAMPLE_WARDROBE,
          query: "layering smart-casual",
          targetSeason: "fall",
          queryEmbedding: [0.8, 0.45, 0.3, 0.16],
        },
        SAMPLE_SHOPIFY_CATALOG,
        storeDomain,
      );
      const wantsHtml =
        url.searchParams.get("view") === "ui" ||
        (request.headers.get("accept") ?? "").includes("text/html");
      if (wantsHtml) {
        return new Response(renderEdgePlaygroundHtml(SAMPLE_WARDROBE, sample, storeDomain), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }
      return json({
        service: "wardrobe-match-edge",
        runtime: "Web Standards (Cloudflare Workers + Vercel Edge)",
        endpoints: [
          "GET /",
          "POST /v1/gaps",
          "POST /v1/match",
          "POST /v1/elasticsearch/query",
          "GET /v1/shopify/proxy",
        ],
        demo: {
          existingValidOutfits: sample.gapReport.existingValidOutfits,
          detectedGaps: sample.gapReport.gaps,
          topMatches: sample.results.map((r) => ({
            name: r.product.name,
            priceUsd: r.product.priceUsd,
            marginalOutfitsUnlocked: r.marginalOutfitsUnlocked,
            averageHarmony: r.averageHarmony,
            fillsGaps: r.fillsGaps,
            shopifyCartUrl: r.shopifyCartUrl,
          })),
        },
      });
    }

    if (request.method === "POST" && url.pathname === "/v1/gaps") {
      const body = (await request.json().catch(() => null)) as Partial<MatchRequest> | null;
      const wardrobe = Array.isArray(body?.wardrobe) ? body.wardrobe : SAMPLE_WARDROBE;
      return json(analyzeWardrobeGaps(wardrobe, body?.targetSeason));
    }

    if (request.method === "POST" && url.pathname === "/v1/match") {
      const body = (await request.json().catch(() => null)) as Partial<MatchRequest> | null;
      if (!body || !Array.isArray(body.wardrobe)) {
        return json({ error: "Expected JSON body with a `wardrobe` array" }, 400);
      }
      const match = runWardrobeMatch(
        {
          wardrobe: body.wardrobe,
          query: body.query,
          maxPriceUsd: body.maxPriceUsd,
          targetSeason: body.targetSeason,
          queryEmbedding: body.queryEmbedding,
          limit: body.limit,
        },
        SAMPLE_SHOPIFY_CATALOG,
        storeDomain,
      );
      return json(match);
    }

    if (request.method === "POST" && url.pathname === "/v1/elasticsearch/query") {
      const body = (await request.json().catch(() => null)) as Partial<MatchRequest> | null;
      const wardrobe = Array.isArray(body?.wardrobe) ? body.wardrobe : SAMPLE_WARDROBE;
      const gapReport = analyzeWardrobeGaps(wardrobe, body?.targetSeason);
      const dsl = compileElasticsearchHybridQuery({
        query: body?.query,
        gapReport,
        maxPriceUsd: body?.maxPriceUsd,
        targetSeason: body?.targetSeason,
        queryEmbedding: body?.queryEmbedding,
        size: body?.limit ?? 10,
      });
      return json({
        index: env.ELASTICSEARCH_INDEX ?? "shopify_products_v1",
        body: dsl,
      });
    }

    if (request.method === "GET" && url.pathname === "/v1/shopify/proxy") {
      const secret = env.SHOPIFY_APP_SECRET;
      if (secret) {
        const valid = await verifyShopifyAppProxySignature(url.searchParams, secret);
        if (!valid) {
          return json({ error: "Invalid Shopify App Proxy signature" }, 401);
        }
      }
      const shop = url.searchParams.get("shop") ?? storeDomain;
      const q = url.searchParams.get("q") ?? undefined;
      const match = runWardrobeMatch(
        { wardrobe: SAMPLE_WARDROBE, query: q },
        SAMPLE_SHOPIFY_CATALOG,
        shop,
      );
      return json({ shop, ...match });
    }

    return json({ error: "Not found" }, 404);
  },
};

export default worker;
