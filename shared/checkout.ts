import { z } from "zod";

export const checkoutInput = z.object({
  shopId: z.number().int().positive(),
  townId: z.number().int().positive(),
  zoneId: z.number().int().positive(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().min(1).max(100),
      })
    )
    .min(1)
    .max(50),
  addressId: z.number().int().positive().optional(),
  fulfillmentType: z.enum(["delivery", "pickup"]),
  paymentMethod: z.enum(["cod", "pickup"]),
  notes: z.string().max(2000).optional(),
  substitutionPreference: z.string().max(80).optional(),
});
export type CheckoutInput = z.infer<typeof checkoutInput>;

// Fixed field order and sorted lines make retries independent of object/line order.
export function checkoutIntent(input: CheckoutInput, customerId: number) {
  return JSON.stringify({
    version: 1,
    customerId,
    shopId: input.shopId,
    townId: input.townId,
    zoneId: input.zoneId,
    fulfillmentType: input.fulfillmentType,
    paymentMethod: input.paymentMethod,
    addressId: input.addressId ?? null,
    notes: input.notes ?? "",
    substitutionPreference: input.substitutionPreference ?? "",
    items: input.items
      .map(i => [i.productId, i.quantity])
      .sort((a, b) => a[0] - b[0]),
  });
}
