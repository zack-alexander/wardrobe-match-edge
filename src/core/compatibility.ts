import { scoreColorHarmony } from "./oklab";
import type {
  Formality,
  GapReport,
  GarmentAttributes,
  GarmentSlot,
  Season,
  UnlockedOutfitSample,
  WardrobeGap,
} from "../types";

const CORE_SLOTS: readonly GarmentSlot[] = ["top", "bottom", "footwear", "outerwear"];
const ALL_SEASONS: readonly Season[] = ["spring", "summer", "fall", "winter"];

function hasSeasonOverlap(items: readonly GarmentAttributes[]): boolean {
  if (items.length === 0) return false;
  return ALL_SEASONS.some((season) => items.every((item) => item.seasons.includes(season)));
}

/**
 * Evaluate whether a tuple of garments forms a coherent outfit.
 * Returns null if formality spread or season mismatch disqualifies the pairing.
 */
export function evaluateOutfit(items: readonly GarmentAttributes[]): UnlockedOutfitSample | null {
  if (items.length < 3 || !hasSeasonOverlap(items)) {
    return null;
  }

  const formalities = items.map((i) => i.formality);
  const spread = Math.max(...formalities) - Math.min(...formalities);
  if (spread > 1) {
    return null;
  }

  let pairScoreSum = 0;
  let pairCount = 0;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const harmony = scoreColorHarmony(items[i].colorHex, items[j].colorHex);
      if (harmony.score < 0.55) {
        return null;
      }
      pairScoreSum += harmony.score;
      pairCount += 1;
    }
  }

  const avgHarmony = pairCount > 0 ? pairScoreSum / pairCount : 0;
  const avgFormality = formalities.reduce((acc, f) => acc + f, 0) / formalities.length;

  return {
    items: items.map((i) => i.name),
    harmonyScore: Number(avgHarmony.toFixed(3)),
    formality: Number(avgFormality.toFixed(1)),
  };
}

/**
 * Enumerate valid 3-piece core outfits (top + bottom + footwear) and
 * 4-piece layered outfits (+ outerwear) from a wardrobe.
 */
export function enumerateOutfits(
  wardrobe: readonly GarmentAttributes[],
  seasonFilter?: Season,
): UnlockedOutfitSample[] {
  const scoped = seasonFilter
    ? wardrobe.filter((item) => item.seasons.includes(seasonFilter))
    : wardrobe;

  const tops = scoped.filter((i) => i.slot === "top");
  const bottoms = scoped.filter((i) => i.slot === "bottom");
  const footwear = scoped.filter((i) => i.slot === "footwear");
  const outerwear = scoped.filter((i) => i.slot === "outerwear");

  const valid: UnlockedOutfitSample[] = [];

  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of footwear) {
        const base = evaluateOutfit([top, bottom, shoe]);
        if (base) {
          valid.push(base);
          for (const coat of outerwear) {
            const layered = evaluateOutfit([top, bottom, shoe, coat]);
            if (layered) {
              valid.push(layered);
            }
          }
        }
      }
    }
  }

  return valid;
}

export function analyzeWardrobeGaps(
  wardrobe: readonly GarmentAttributes[],
  targetSeason?: Season,
): GapReport {
  const slotCounts: Record<GarmentSlot, number> = {
    top: 0,
    bottom: 0,
    outerwear: 0,
    footwear: 0,
  };
  for (const item of wardrobe) {
    slotCounts[item.slot] += 1;
  }

  const existingValidOutfits = enumerateOutfits(wardrobe, targetSeason).length;
  const gaps: WardrobeGap[] = [];
  const seasonsToInspect = targetSeason ? [targetSeason] : (["spring", "fall"] as const);

  // Identify missing structural slots and formality tiers with zero coverage.
  const dominantFormality = inferDominantFormality(wardrobe);

  for (const season of seasonsToInspect) {
    for (const slot of CORE_SLOTS) {
      const matching = wardrobe.filter(
        (item) =>
          item.slot === slot &&
          item.seasons.includes(season) &&
          Math.abs(item.formality - dominantFormality) <= 1,
      );
      if (matching.length === 0) {
        gaps.push({
          slot,
          formality: dominantFormality,
          season,
          severity: slot === "outerwear" ? "medium" : "high",
          reason: `No formality-${dominantFormality} ${slot} available for ${season}`,
        });
      } else if (slot === "outerwear" && matching.length === 1 && wardrobe.length >= 6) {
        gaps.push({
          slot,
          formality: dominantFormality,
          season,
          severity: "medium",
          reason: `Single ${season} outerwear piece limits layering versatility`,
        });
      }
    }
  }

  return {
    itemCount: wardrobe.length,
    existingValidOutfits,
    slotCounts,
    gaps,
  };
}

function inferDominantFormality(wardrobe: readonly GarmentAttributes[]): Formality {
  if (wardrobe.length === 0) return 3;
  const counts = new Map<Formality, number>();
  for (const item of wardrobe) {
    counts.set(item.formality, (counts.get(item.formality) ?? 0) + 1);
  }
  let best: Formality = 3;
  let bestCount = -1;
  for (const [formality, count] of counts.entries()) {
    if (count > bestCount) {
      best = formality;
      bestCount = count;
    }
  }
  return best;
}

export interface MarginalUtilityEvaluation {
  readonly marginalOutfitsUnlocked: number;
  readonly averageHarmony: number;
  readonly fillsGaps: readonly string[];
  readonly sampleOutfits: readonly UnlockedOutfitSample[];
}

/**
 * Compute Delta-Outfits(P | W): the exact number of net-new valid outfits
 * unlocked by adding candidate product P to existing wardrobe W.
 */
export function evaluateMarginalUtility(
  wardrobe: readonly GarmentAttributes[],
  candidate: GarmentAttributes,
  gapReport: GapReport,
  seasonFilter?: Season,
): MarginalUtilityEvaluation {
  const withCandidate = enumerateOutfits([...wardrobe, candidate], seasonFilter);
  const candidateOutfits = withCandidate
    .filter((outfit) => outfit.items.includes(candidate.name))
    .sort((a, b) => b.harmonyScore - a.harmonyScore);

  const averageHarmony =
    candidateOutfits.length > 0
      ? Number(
          (
            candidateOutfits.reduce((sum, o) => sum + o.harmonyScore, 0) / candidateOutfits.length
          ).toFixed(3),
        )
      : 0;

  const fillsGaps = gapReport.gaps
    .filter(
      (gap) =>
        gap.slot === candidate.slot &&
        candidate.seasons.includes(gap.season) &&
        Math.abs(candidate.formality - gap.formality) <= 1,
    )
    .map((gap) => gap.reason);

  return {
    marginalOutfitsUnlocked: candidateOutfits.length,
    averageHarmony,
    fillsGaps,
    sampleOutfits: candidateOutfits.slice(0, 3),
  };
}
