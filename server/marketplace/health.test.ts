import { describe, expect, it, vi } from "vitest";
import { cachedReadiness } from "./health";
describe("health resource bounds", () => {
  it("coalesces concurrent probes and reuses successful checks for fifteen seconds", async () => {
    let now = 10000;
    const check = vi.fn(async () => {}),
      ready = cachedReadiness(check, () => now);
    expect(await Promise.all(Array.from({ length: 50 }, ready))).toEqual(
      Array(50).fill(true)
    );
    await ready();
    expect(check).toHaveBeenCalledTimes(1);
    now += 15000;
    await ready();
    expect(check).toHaveBeenCalledTimes(2);
  });
  it("does not expose database errors and retries failures after three seconds", async () => {
    let now = 10000;
    const check = vi.fn(async () => {
        throw Error("private database details");
      }),
      ready = cachedReadiness(check, () => now);
    expect(await ready()).toBe(false);
    expect(await ready()).toBe(false);
    expect(check).toHaveBeenCalledTimes(1);
    now += 3000;
    expect(await ready()).toBe(false);
    expect(check).toHaveBeenCalledTimes(2);
  });
});
