import { describe, expect, it } from "vitest";
import {
  clearCheckoutKey,
  getCheckoutKey,
  parseCart,
  readCheckoutAttempt,
  restoreBrowserCart,
} from "./cart";
import { checkoutIntent, type CheckoutInput } from "@shared/checkout";

const product = {
  id: 1,
  shopId: 2,
  name: "Rice",
  unit: "kg",
  pricePaise: 1050,
  mrpPaise: null,
  inStock: true,
  availability: "available",
};
const line = { product, quantity: 2 };
describe("safe cart restoration", () => {
  it("recovers the complete last checkout attempt without minting another key", () => {
    let saved: string | null = null;
    const storage = () => ({
      getItem: () => saved,
      setItem: (_key: string, value: string) => {
        saved = value;
      },
      removeItem: () => {
        saved = null;
      },
    });
    const fingerprint = JSON.stringify({
      customerId: 42,
      notes: "Keep this note",
      fulfillmentType: "pickup",
    });
    const key = getCheckoutKey(fingerprint, storage);
    expect(readCheckoutAttempt(storage)).toEqual({
      fingerprint,
      key,
      customerId: 42,
    });
    expect(getCheckoutKey(fingerprint, storage)).toBe(key);
    clearCheckoutKey(key, storage);
    expect(readCheckoutAttempt(storage)).toBeUndefined();
  });
  it("restores valid product identity and quantity, with display defaults", () => {
    const restored = parseCart(JSON.stringify([line]));
    expect(restored.notice).toBe("");
    expect(restored.cart[0]).toMatchObject(line);
  });
  it.each([
    "{",
    "null",
    "{}",
    JSON.stringify([{ ...line, quantity: 0 }]),
    JSON.stringify([{ ...line, quantity: 1.5 }]),
    JSON.stringify([{ ...line, product: { ...product, pricePaise: -1 } }]),
    JSON.stringify([{ ...line, product: { ...product, id: 0 } }]),
    JSON.stringify([line, line]),
    JSON.stringify([
      line,
      { ...line, product: { ...product, id: 3, shopId: 4 } },
    ]),
    JSON.stringify(Array(51).fill(line)),
  ])(
    "rejects invalid or ambiguous stored cart %s with a recovery notice",
    raw => {
      expect(parseCart(raw)).toMatchObject({
        cart: [],
        notice: expect.stringContaining("restored safely"),
      });
    }
  );
  it("survives blocked storage including a throwing localStorage getter", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(restoreBrowserCart(blocked)).toMatchObject({
      cart: [],
      notice: expect.stringContaining("unavailable"),
    });
    const key = getCheckoutKey("blocked-storage-test", blocked);
    expect(getCheckoutKey("blocked-storage-test", blocked)).toBe(key);
    clearCheckoutKey(key, blocked);
    expect(getCheckoutKey("blocked-storage-test", blocked)).not.toBe(key);
  });
  it("keeps a retry key when writing storage fails and changes it for a new intent", () => {
    const storage = () => ({
      getItem: () => "broken-json",
      setItem: () => {
        throw Error("QuotaExceeded");
      },
      removeItem: () => {},
    });
    const key = getCheckoutKey("quota-test", storage);
    expect(getCheckoutKey("quota-test", storage)).toBe(key);
    expect(getCheckoutKey("different-quota-test", storage)).not.toBe(key);
  });
});

describe("complete checkout identity", () => {
  const input: CheckoutInput = {
    shopId: 1,
    townId: 1,
    zoneId: 1,
    items: [
      { productId: 1, quantity: 1 },
      { productId: 2, quantity: 2 },
    ],
    fulfillmentType: "delivery",
    paymentMethod: "cod",
    addressId: 1,
  };
  it("ignores line order and optional empty text", () => {
    expect(checkoutIntent(input, 1)).toBe(
      checkoutIntent(
        { ...input, notes: "", items: [...input.items].reverse() },
        1
      )
    );
  });
  it.each([
    { addressId: 2 },
    { fulfillmentType: "pickup", paymentMethod: "pickup" },
    { notes: "Ring bell" },
    { substitutionPreference: "None" },
    { shopId: 2 },
    { townId: 2 },
    { zoneId: 2 },
    { items: [{ productId: 1, quantity: 3 }] },
  ] as Partial<CheckoutInput>[])("binds changed content %o", changed => {
    expect(checkoutIntent({ ...input, ...changed }, 1)).not.toBe(
      checkoutIntent(input, 1)
    );
  });
  it("separates signed-in customers", () =>
    expect(checkoutIntent(input, 2)).not.toBe(checkoutIntent(input, 1)));
});
