export type GarmentSlot = "top" | "bottom" | "outerwear" | "footwear";
export type Season = "spring" | "summer" | "fall" | "winter";

/** Formality scale: 1 = athletic/lounge, 2 = casual, 3 = smart-casual, 4 = tailored, 5 = formal. */
export type Formality = 1 | 2 | 3 | 4 | 5;

export interface GarmentAttributes {
  readonly id: string;
  readonly name: string;
  readonly slot: GarmentSlot;
  readonly colorHex: string;
  readonly colorName: string;
  readonly formality: Formality;
  readonly seasons: readonly Season[];
  readonly fabric: string;
  readonly tags: readonly string[];
}

export interface CatalogProduct extends GarmentAttributes {
  readonly shopifyVariantId: string;
  readonly handle: string;
  readonly priceUsd: number;
  readonly inStock: boolean;
  readonly description: string;
  /** Optional unit-normalized semantic style vector for kNN / hybrid search. */
  readonly embedding?: readonly number[];
}

export interface WardrobeGap {
  readonly slot: GarmentSlot;
  readonly formality: Formality;
  readonly season: Season;
  readonly severity: "high" | "medium";
  readonly reason: string;
}

export interface GapReport {
  readonly itemCount: number;
  readonly existingValidOutfits: number;
  readonly slotCounts: Record<GarmentSlot, number>;
  readonly gaps: readonly WardrobeGap[];
}

export interface UnlockedOutfitSample {
  readonly items: readonly string[];
  /** Stable garment ids parallel to `items`, used for identity (names can collide). */
  readonly itemIds: readonly string[];
  readonly harmonyScore: number;
  readonly formality: number;
}

export interface ProductMatchResult {
  readonly product: CatalogProduct;
  readonly combinedScore: number;
  readonly rrfScore: number;
  readonly lexicalScore: number;
  readonly marginalOutfitsUnlocked: number;
  readonly averageHarmony: number;
  readonly fillsGaps: readonly string[];
  readonly sampleOutfits: readonly UnlockedOutfitSample[];
  readonly shopifyCartUrl: string;
}

export interface MatchRequest {
  readonly wardrobe: readonly GarmentAttributes[];
  readonly query?: string;
  readonly maxPriceUsd?: number;
  readonly targetSeason?: Season;
  readonly queryEmbedding?: readonly number[];
  readonly limit?: number;
}

export interface WorkerEnv {
  readonly DEFAULT_STORE_DOMAIN?: string;
  readonly ELASTICSEARCH_INDEX?: string;
  readonly ELASTICSEARCH_URL?: string;
  readonly ELASTICSEARCH_API_KEY?: string;
  readonly SHOPIFY_APP_SECRET?: string;
}
