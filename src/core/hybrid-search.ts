import type { CatalogProduct } from "../types";

export interface RankedDoc {
  readonly id: string;
  readonly score: number;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

function productSearchText(product: CatalogProduct): string {
  return [
    product.name,
    product.slot,
    product.colorName,
    product.fabric,
    product.description,
    ...product.tags,
    ...product.seasons,
  ].join(" ");
}

/**
 * Exact Okapi BM25 lexical scoring at the edge (k1 = 1.2, b = 0.75).
 */
export function scoreBM25(query: string, catalog: readonly CatalogProduct[]): RankedDoc[] {
  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) {
    return catalog.map((p) => ({ id: p.id, score: 1 }));
  }

  const docTokens = catalog.map((p) => tokenize(productSearchText(p)));
  const avgDocLen =
    docTokens.reduce((sum, tokens) => sum + tokens.length, 0) / Math.max(1, docTokens.length);
  const N = catalog.length;
  const k1 = 1.2;
  const b = 0.75;

  const docFreq = new Map<string, number>();
  for (const tokens of docTokens) {
    for (const uniqueTerm of new Set(tokens)) {
      docFreq.set(uniqueTerm, (docFreq.get(uniqueTerm) ?? 0) + 1);
    }
  }

  const scored: RankedDoc[] = [];
  for (let i = 0; i < catalog.length; i++) {
    const tokens = docTokens[i];
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }

    let score = 0;
    for (const term of queryTerms) {
      const f = tf.get(term) ?? 0;
      if (f === 0) continue;
      const df = docFreq.get(term) ?? 0;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      const denom = f + k1 * (1 - b + b * (tokens.length / Math.max(1, avgDocLen)));
      score += idf * ((f * (k1 + 1)) / denom);
    }
    if (score > 0) {
      scored.push({ id: catalog[i].id, score: Number(score.toFixed(4)) });
    }
  }

  return scored.sort((a, b) => b.score - a.score);
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Reciprocal Rank Fusion (Cormack et al., 2009):
 * RRF(d) = sum_r (weight_r / (k + rank_r(d))), matching Elasticsearch's `rrf` retriever.
 */
export function reciprocalRankFusion(
  rankings: readonly { readonly docs: readonly RankedDoc[]; readonly weight?: number }[],
  k = 60,
): Map<string, number> {
  const fused = new Map<string, number>();
  for (const { docs, weight = 1 } of rankings) {
    for (let idx = 0; idx < docs.length; idx++) {
      const rank = idx + 1;
      const prev = fused.get(docs[idx].id) ?? 0;
      fused.set(docs[idx].id, prev + weight / (k + rank));
    }
  }
  return fused;
}
