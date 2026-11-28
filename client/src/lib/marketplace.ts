import { demoProductImage } from "@shared/demo-product-images";
import type { PublicOffer } from "@shared/offers";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type HomeOutput = RouterOutputs["marketplace"]["home"];
export type ShopOutput = RouterOutputs["marketplace"]["shop"];
export type ProductOutput = RouterOutputs["marketplace"]["product"];
export type MarketShop = {
  id: number;
  townId: number;
  zoneId: number;
  name: string;
  category: string;
  categoryLabel: string;
  locality: string;
  description: string;
  eta: string;
  deliveryFeePaise: number;
  platformFeePaise: number;
  minimumPaise: number;
  image: string;
  isOpen: boolean;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  isDemo: boolean;
  ratingAverage: number | null;
  ratingCount: number;
};
export type MarketProduct = {
  gstIncluded?: boolean;
  offer?: PublicOffer | null;
  shopName?: string;
  id: number;
  shopId: number;
  name: string;
  unit: string;
  pricePaise: number;
  mrpPaise: number | null;
  image: string;
  category: string;
  categoryId?: number;
  note?: string;
  inStock: boolean;
  availability: string;
  isDemo: boolean;
};
export type Category = {
  id: number;
  slug: string;
  name: string;
  icon?: string | null;
  description?: string | null;
  enabled: boolean;
  regulated: boolean;
};
export const demoNotice =
  "Demo listings are fictional; prices and availability are shown from the marketplace database.";
export const assetFallback = "/product-placeholder.svg";
export function imageFallback(event: { currentTarget: HTMLImageElement }) {
  if (event.currentTarget.getAttribute("src") !== assetFallback)
    event.currentTarget.src = assetFallback;
}
export const formatINR = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
export function toMarketShop(shop: any): MarketShop {
  return {
    id: shop.id,
    townId: shop.townId,
    zoneId: shop.zoneId,
    name: shop.shopName,
    category: shop.category?.slug ?? "",
    categoryLabel: shop.category?.name ?? "Local shop",
    locality: shop.locality ?? "",
    description: shop.description ?? "",
    eta: `${shop.preparationMinutes ?? 30} min preparation`,
    deliveryFeePaise: shop.deliveryFeePaise,
    platformFeePaise: shop.platformFeePaise ?? 0,
    minimumPaise: shop.minimumOrderPaise,
    image: shop.coverUrl || shop.logoUrl || assetFallback,
    isOpen: Boolean(shop.isOpen),
    deliveryEnabled: Boolean(shop.deliveryEnabled),
    pickupEnabled: Boolean(shop.pickupEnabled),
    isDemo: Boolean(shop.isDemo),
    ratingAverage:
      shop.ratingAverage == null ? null : Number(shop.ratingAverage),
    ratingCount: Number(shop.ratingCount ?? 0),
  };
}
export function toMarketProduct(
  product: any,
  shopId?: number,
  categorySlug?: string
): MarketProduct {
  return {
    id: product.id,
    shopId: product.vendorId ?? shopId,
    name: product.name,
    unit: product.unit,
    pricePaise: product.pricePaise,
    offer: product.offer || null,
    gstIncluded: product.gstIncluded,
    shopName: product.shopName,
    mrpPaise: product.mrpPaise,
    image: demoProductImage(product) || assetFallback,
    category: categorySlug ?? "",
    categoryId: product.categoryId,
    note: product.description ?? undefined,
    inStock: Boolean(product.inStock),
    availability: product.availability,
    isDemo: Boolean(product.isDemo),
  };
}
export const titleCase = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
