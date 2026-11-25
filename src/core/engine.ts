import { compileElasticsearchHybridQuery } from "../adapters/elasticsearch";
import { buildShopifyCartPermalink } from "../adapters/shopify";
import { analyzeWardrobeGaps, evaluateMarginalUtility } from "./compatibility";
import { cosineSimilarity, reciprocalRankFusion, scoreBM25, type RankedDoc } from "./hybrid-search";
import type { CatalogProduct, GapReport, MatchRequest, ProductMatchResult } from "../types";

export interface MatchEngineResponse {
  readonly gapReport: GapReport;
  readonly elasticsearchQuery: Record<string, unknown>;
  readonly results: readonly ProductMatchResult[];
}

export function runWardrobeMatch(
  request: MatchRequest,
  catalog: readonly CatalogProduct[],
  storeDomain = "demo-atelier.myshopify.com",
): MatchEngineResponse {
  const gapReport = analyzeWardrobeGaps(request.wardrobe, request.targetSeason);

  const eligible = catalog.filter((product) => {
    if (!product.inStock) return false;
    if (typeof request.maxPriceUsd === "number" && product.priceUsd > request.maxPriceUsd) {
      return false;
    }
    if (request.targetSeason && !product.seasons.includes(request.targetSeason)) {
      return false;
    }
    return true;
  });

  const lexicalRanking = request.query?.trim()
    ? scoreBM25(request.query, eligible)
    : eligible.map((p) => ({ id: p.id, score: 1 }));
  const lexicalById = new Map(lexicalRanking.map((d) => [d.id, d.score]));

  const marginalById = new Map(
    eligible.map((product) => [
      product.id,
      evaluateMarginalUtility(request.wardrobe, product, gapReport, request.targetSeason),
    ]),
  );

  const compatibilityRanking: RankedDoc[] = eligible
    .map((p) => {
      const m = marginalById.get(p.id)!;
      const gapBonus = m.fillsGaps.length * 3;
      const rawScore = m.marginalOutfitsUnlocked * (0.5 + m.averageHarmony) + gapBonus;
      return { id: p.id, score: rawScore };
    })
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score);

  const rankings: { readonly docs: readonly RankedDoc[]; readonly weight: number }[] = [
    { docs: compatibilityRanking, weight: 1.5 },
  ];

  if (request.query?.trim()) {
    rankings.push({ docs: lexicalRanking, weight: 1.0 });
  }

  if (request.queryEmbedding && request.queryEmbedding.length > 0) {
    const vectorRanking: RankedDoc[] = eligible
      .filter((p) => p.embedding && p.embedding.length > 0)
      .map((p) => ({
        id: p.id,
        score: cosineSimilarity(request.queryEmbedding!, p.embedding!),
      }))
      .sort((a, b) => b.score - a.score);
    if (vectorRanking.length > 0) {
      rankings.push({ docs: vectorRanking, weight: 1.0 });
    }
  }

  const rrfScores = reciprocalRankFusion(rankings, 60);

  const results: ProductMatchResult[] = eligible
    .map((product) => {
      const marginal = marginalById.get(product.id)!;
      const rrfScore = Number((rrfScores.get(product.id) ?? 0).toFixed(5));
      const lexicalScore = lexicalById.get(product.id) ?? 0;
      const combinedScore = Number(
        (rrfScore * 100 + marginal.marginalOutfitsUnlocked * 0.5 + marginal.fillsGaps.length).toFixed(
          3,
        ),
      );
      return {
        product,
        combinedScore,
        rrfScore,
        lexicalScore,
        marginalOutfitsUnlocked: marginal.marginalOutfitsUnlocked,
        averageHarmony: marginal.averageHarmony,
        fillsGaps: marginal.fillsGaps,
        sampleOutfits: marginal.sampleOutfits,
        shopifyCartUrl: buildShopifyCartPermalink(
          storeDomain,
          [{ variantId: product.shopifyVariantId, quantity: 1 }],
          {
            source: "wardrobe_match_edge",
            unlocked_outfits: String(marginal.marginalOutfitsUnlocked),
          },
        ),
      };
    })
    .filter((r) => r.marginalOutfitsUnlocked > 0 || r.lexicalScore > 0)
    .sort(
      (a, b) =>
        b.combinedScore - a.combinedScore ||
        b.marginalOutfitsUnlocked - a.marginalOutfitsUnlocked,
    )
    .slice(0, request.limit ?? 10);

  const elasticsearchQuery = compileElasticsearchHybridQuery({
    query: request.query,
    gapReport,
    maxPriceUsd: request.maxPriceUsd,
    targetSeason: request.targetSeason,
    queryEmbedding: request.queryEmbedding,
    size: request.limit ?? 10,
  });

  return { gapReport, elasticsearchQuery, results };
}
