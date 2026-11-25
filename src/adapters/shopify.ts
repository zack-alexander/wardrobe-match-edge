import type { CatalogProduct, Formality, GarmentSlot, Season } from "../types";

export interface ShopifyStorefrontProductNode {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: string;
  readonly productType: string;
  readonly tags: readonly string[];
  readonly priceRange: {
    readonly minVariantPrice: { readonly amount: string };
  };
  readonly variants: {
    readonly nodes: readonly {
      readonly id: string;
      readonly availableForSale: boolean;
    }[];
  };
  readonly metafields?: readonly ({ readonly key: string; readonly value: string } | null)[];
}

const VALID_SLOTS = new Set<GarmentSlot>(["top", "bottom", "outerwear", "footwear"]);
const VALID_SEASONS = new Set<Season>(["spring", "summer", "fall", "winter"]);

function stripGid(gid: string): string {
  const parts = gid.split("/");
  return parts[parts.length - 1] || gid;
}

/**
 * Build a 1-click Shopify Cart Permalink that preloads matched items
 * directly into a merchant's checkout cart.
 */
export function buildShopifyCartPermalink(
  storeDomain: string,
  items: readonly { readonly variantId: string; readonly quantity?: number }[],
  attributes?: Record<string, string>,
): string {
  const domain = storeDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const lineItems = items
    .map((item) => `${stripGid(item.variantId)}:${item.quantity ?? 1}`)
    .join(",");
  const url = new URL(`https://${domain}/cart/${lineItems}`);
  if (attributes) {
    for (const [k, v] of Object.entries(attributes)) {
      url.searchParams.set(`attributes[${k}]`, v);
    }
  }
  return url.toString();
}

/**
 * Normalize a Shopify Storefront GraphQL Product node into a CatalogProduct
 * consumable by the Wardrobe Compatibility Graph.
 */
export function normalizeShopifyProduct(node: ShopifyStorefrontProductNode): CatalogProduct {
  const meta = new Map<string, string>();
  for (const field of node.metafields ?? []) {
    if (field) meta.set(field.key, field.value);
  }

  const rawSlot = (meta.get("wardrobe_slot") ?? node.productType).toLowerCase() as GarmentSlot;
  const slot: GarmentSlot = VALID_SLOTS.has(rawSlot) ? rawSlot : "top";

  const rawFormality = Number.parseInt(meta.get("formality") ?? "3", 10);
  const formality = (
    rawFormality >= 1 && rawFormality <= 5 ? rawFormality : 3
  ) as Formality;

  const parsedSeasons = (meta.get("seasons") ?? "spring,fall")
    .split(",")
    .map((s) => s.trim().toLowerCase() as Season)
    .filter((s) => VALID_SEASONS.has(s));

  const primaryVariant = node.variants.nodes[0];

  return {
    id: stripGid(node.id),
    shopifyVariantId: primaryVariant ? stripGid(primaryVariant.id) : stripGid(node.id),
    handle: node.handle,
    name: node.title,
    slot,
    colorHex: meta.get("color_hex") ?? "#2F3A4A",
    colorName: meta.get("color_name") ?? "Navy",
    formality,
    seasons: parsedSeasons.length > 0 ? parsedSeasons : ["spring", "fall"],
    fabric: meta.get("fabric") ?? "cotton",
    tags: node.tags,
    priceUsd: Number.parseFloat(node.priceRange.minVariantPrice.amount) || 0,
    inStock: primaryVariant ? primaryVariant.availableForSale : true,
    description: node.description,
  };
}

/**
 * Verify a Shopify App Proxy request signature using Web Crypto HMAC-SHA256
 * (works natively on Cloudflare Workers and Vercel Edge with zero Node crypto imports).
 */
export async function verifyShopifyAppProxySignature(
  query: URLSearchParams,
  sharedSecret: string,
): Promise<boolean> {
  const provided = query.get("signature");
  if (!provided || !sharedSecret) return false;

  const canonical = Array.from(query.entries())
    .filter(([key]) => key !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("");

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sharedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const macBuffer = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(canonical));
  const computedHex = Array.from(new Uint8Array(macBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time string comparison
  if (computedHex.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ provided.toLowerCase().charCodeAt(i);
  }
  return diff === 0;
}
