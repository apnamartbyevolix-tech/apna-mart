import { describe, it, expect } from "vitest";
import {
  activeOffer,
  effectiveProduct,
  type PublicOffer,
} from "../../shared/offers";
const now = new Date("2026-11-06T12:00:00Z");
const o: PublicOffer = {
  id: "1",
  title: "Local savings",
  festival: "Diwali",
  referencePricePaise: 8500,
  pricePaise: 7650,
  startsAt: "2026-11-06T11:00:00Z",
  endsAt: "2026-11-06T13:00:00Z",
  maxPerOrder: 5,
};
describe("public effective offer price", () => {
  it("uses the active offer price in public reads and checkout", () =>
    expect(
      effectiveProduct({ pricePaise: 8500, offerMeta: o }, now).pricePaise
    ).toBe(7650));
  it("restores the actual normal price on expiry even if catalogue delivery is delayed", () =>
    expect(
      effectiveProduct(
        { pricePaise: 7650, offerMeta: { ...o, endsAt: now.toISOString() } },
        now
      )
    ).toEqual({ pricePaise: 8500, offerMeta: null }));
  it("leaves non-offer products unchanged", () =>
    expect(effectiveProduct({ pricePaise: 8500 }, now)).toEqual({
      pricePaise: 8500,
    }));
  it("rejects invalid dates, zero or non-discount prices", () => {
    for (const patch of [
      { endsAt: "bad" },
      { pricePaise: 0 },
      { pricePaise: 8500 },
    ])
      expect(activeOffer({ ...o, ...patch }, now)).toBeNull();
  });
  it("starts inclusively and ends exclusively", () => {
    expect(
      activeOffer({ ...o, startsAt: now.toISOString() }, now)
    ).not.toBeNull();
    expect(activeOffer({ ...o, endsAt: now.toISOString() }, now)).toBeNull();
  });
});
