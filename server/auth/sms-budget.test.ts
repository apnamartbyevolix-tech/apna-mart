import { describe, expect, it, vi } from "vitest";
import { reserveSmsBudget, smsBudgetWindows } from "./sms-budget";
describe("provider SMS budget boundaries", () => {
  it("uses Indian calendar boundaries including month/year rollover", () => {
    const windows = smsBudgetWindows(new Date("2026-12-31T19:00:00Z"), {});
    expect(windows.map(window => window.key)).toEqual(["day:2027-01-01", "month:2027-01"]);
    expect(windows[0].until.toISOString()).toBe("2027-01-01T18:30:00.000Z");
    expect(windows[1].until.toISOString()).toBe("2027-01-31T18:30:00.000Z");
  });
  it("supports an explicit zero ceiling and rejects invalid configuration", () => {
    expect(smsBudgetWindows(new Date(), { MTM_SMS_DAILY_LIMIT: "0" })[0].max).toBe(0);
    for (const value of ["-1", "NaN", "1.5", "1000001"]) expect(() => smsBudgetWindows(new Date(), { MTM_SMS_DAILY_LIMIT: value })).toThrow();
  });
  it("never increments either quota when one window is exhausted", async () => {
    let reads = 0;
    const execute = vi.fn(async () => ({ rows: [{ hits: ++reads === 4 ? 1000000 : 0 }] }));
    const tx = { execute };
    expect(await reserveSmsBudget(tx, value => value, new Date(), { MTM_SMS_DAILY_LIMIT: "1", MTM_SMS_MONTHLY_LIMIT: "1" })).toBe(false);
    expect(execute).toHaveBeenCalledTimes(4);
  });
});
