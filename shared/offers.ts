export type PublicOffer = {
  id: string;
  title: string;
  festival: string | null;
  referencePricePaise: number;
  pricePaise: number;
  startsAt: string;
  endsAt: string;
  maxPerOrder: number | null;
};
export function activeOffer(
  value: unknown,
  now = new Date()
): PublicOffer | null {
  const o = value as PublicOffer | null;
  if (
    !o ||
    typeof o.title !== "string" ||
    !Number.isSafeInteger(o.referencePricePaise) ||
    !Number.isSafeInteger(o.pricePaise) ||
    o.pricePaise <= 0 ||
    o.pricePaise >= o.referencePricePaise ||
    !Number.isFinite(Date.parse(o.startsAt)) ||
    !Number.isFinite(Date.parse(o.endsAt)) ||
    new Date(o.startsAt) > now ||
    new Date(o.endsAt) <= now
  )
    return null;
  return o;
}
/** Never retain an expired offer price while waiting for catalogue delivery. */
export function effectiveProduct<
  T extends { pricePaise: number; offerMeta?: unknown },
>(product: T, now = new Date()): T {
  const offer = activeOffer(product.offerMeta, now);
  if (offer) return { ...product, pricePaise: offer.pricePaise };
  const prior = product.offerMeta as PublicOffer | null;
  return prior && Number.isSafeInteger(prior.referencePricePaise)
    ? { ...product, pricePaise: prior.referencePricePaise, offerMeta: null }
    : product;
}
