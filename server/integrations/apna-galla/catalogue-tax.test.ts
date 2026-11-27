import { describe, expect, it } from "vitest";
import { catalogueSchema } from "./sandbox";
const merchantId = "11111111-1111-4111-8111-111111111111";
const item = { sku: "TAX-TEST", name: "Fictional tax test", unit: "pc", pricePaise: 11800, quantity: 5, tax: { schema: 1, netUnitPaise: 10000, offerNetUnitPaise: null, gstBps: 1800, hsn: "TEST" } };
const catalogue = { revision: "2.0-sandbox", merchantId, version: 1, live: true, shop: { name: "Fictional test shop" }, eligibility: { isValid: true, tier: "test", expiresAt: "2027-01-01T00:00:00Z", marketplaceEnabled: true, currency: "INR" }, items: [item] };
describe("versioned atomic catalogue boundary", () => {
  it("accepts a bounded 500-item GST catalogue", () => expect(catalogueSchema.safeParse({ ...catalogue, items: Array.from({ length: 500 }, (_, index) => ({ ...item, sku: String(index) })) }).success).toBe(true));
  it.each([
    { items: [{ ...item, pricePaise: 10000 }] }, { items: [{ ...item, tax: undefined }] },
    { items: [{ ...item, tax: { ...item.tax, gstBps: 1800.5 } }] },
    { revision: "1.2-sandbox" }, { items: Array.from({ length: 501 }, () => item) },
  ])("rejects inconsistent tax snapshots and limits", change => expect(catalogueSchema.safeParse({ ...catalogue, ...change }).success).toBe(false));
  it("preserves tax-free legacy catalogues and their old size limit", () => {
    const { tax, ...legacy } = item;
    expect(catalogueSchema.safeParse({ ...catalogue, revision: "1.2-sandbox", items: [{ ...legacy, pricePaise: 10000 }] }).success).toBe(true);
    expect(catalogueSchema.safeParse({ ...catalogue, revision: "1.2-sandbox", items: Array.from({ length: 31 }, () => legacy) }).success).toBe(false);
  });
});
