import type { GapReport, Season } from "../types";

export interface ElasticHybridQueryOptions {
  readonly query?: string;
  readonly gapReport: GapReport;
  readonly maxPriceUsd?: number;
  readonly targetSeason?: Season;
  readonly queryEmbedding?: readonly number[];
  readonly size?: number;
  readonly rrfRankConstant?: number;
}

/**
 * Compile a Wardrobe Gap Report into an Elasticsearch 8.14+ / 9.x hybrid search body
 * using the native `retriever.rrf` (Reciprocal Rank Fusion) combining:
 *   1. Structured wardrobe-gap filters (in_stock, price, season, gap slots)
 *   2. Lexical BM25 `multi_match` over merchant product attributes
 *   3. Optional dense-vector `knn` style similarity
 */
export function compileElasticsearchHybridQuery(
  opts: ElasticHybridQueryOptions,
): Record<string, unknown> {
  const filters: Record<string, unknown>[] = [{ term: { in_stock: true } }];

  if (typeof opts.maxPriceUsd === "number") {
    filters.push({ range: { price_usd: { lte: opts.maxPriceUsd } } });
  }

  if (opts.targetSeason) {
    filters.push({ term: { seasons: opts.targetSeason } });
  }

  const highPrioritySlots = Array.from(new Set(opts.gapReport.gaps.map((g) => g.slot)));
  const shouldBoosts: Record<string, unknown>[] = [];
  if (highPrioritySlots.length > 0) {
    shouldBoosts.push({
      terms: { slot: highPrioritySlots, boost: 2.0 },
    });
  }

  const lexicalMust: Record<string, unknown>[] = opts.query?.trim()
    ? [
        {
          multi_match: {
            query: opts.query.trim(),
            fields: ["name^3", "fabric^2", "color_name^1.5", "tags^2", "description"],
            type: "best_fields",
            fuzziness: "AUTO",
          },
        },
      ]
    : [{ match_all: {} }];

  const standardRetriever = {
    standard: {
      query: {
        bool: {
          filter: filters,
          must: lexicalMust,
          should: shouldBoosts,
        },
      },
    },
  };

  if (opts.queryEmbedding && opts.queryEmbedding.length > 0) {
    return {
      size: opts.size ?? 10,
      retriever: {
        rrf: {
          rank_window_size: Math.max(50, (opts.size ?? 10) * 5),
          rank_constant: opts.rrfRankConstant ?? 60,
          retrievers: [
            standardRetriever,
            {
              knn: {
                field: "style_embedding",
                query_vector: opts.queryEmbedding,
                k: 25,
                num_candidates: 100,
                filter: { bool: { filter: filters } },
              },
            },
          ],
        },
      },
    };
  }

  return {
    size: opts.size ?? 10,
    query: standardRetriever.standard.query,
  };
}

export async function executeElasticsearchSearch(
  url: string,
  index: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const endpoint = `${url.replace(/\/+$/, "")}/${encodeURIComponent(index)}/_search`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `ApiKey ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Elasticsearch query failed (${res.status}): ${await res.text()}`);
  }
  return res.json();
}
