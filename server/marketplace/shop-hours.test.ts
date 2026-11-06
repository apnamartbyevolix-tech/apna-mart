import { describe, it, expect } from "vitest";
import { validShopHours, withinShopHours } from "../../shared/shop-hours";
const at = (time: string) => new Date("2026-11-06T" + time + ":00+05:30");
describe("online opening hours in India time", () => {
  it("keeps manual-only shops unchanged", () =>
    expect(withinShopHours(null, at("03:00"))).toBe(true));
  it("opens inclusively and closes exclusively", () => {
    const s = { openingTime: "09:00", closingTime: "21:00" };
    expect(withinShopHours(s, at("08:59"))).toBe(false);
    expect(withinShopHours(s, at("09:00"))).toBe(true);
    expect(withinShopHours(s, at("20:59"))).toBe(true);
    expect(withinShopHours(s, at("21:00"))).toBe(false);
  });
  it("supports overnight hours", () => {
    const s = { openingTime: "20:00", closingTime: "02:00" };
    expect(withinShopHours(s, at("23:00"))).toBe(true);
    expect(withinShopHours(s, at("01:00"))).toBe(true);
    expect(withinShopHours(s, at("02:00"))).toBe(false);
    expect(withinShopHours(s, at("14:00"))).toBe(false);
  });
  it("uses India time independently of the server timezone", () =>
    expect(
      withinShopHours(
        { openingTime: "09:00", closingTime: "21:00" },
        new Date("2026-11-06T04:00:00Z")
      )
    ).toBe(true));
  it("fails closed for incomplete, equal or malformed hours", () => {
    for (const s of [
      { openingTime: "09:00" },
      { openingTime: "09:00", closingTime: "09:00" },
      { openingTime: "25:00", closingTime: "08:00" },
    ]) {
      expect(validShopHours(s)).toBe(false);
      expect(withinShopHours(s, at("12:00"))).toBe(false);
    }
  });
});
