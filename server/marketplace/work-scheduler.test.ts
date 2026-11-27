import { afterEach, describe, expect, it, vi } from "vitest";
import { startOrderWorker, notifyOrderWork, orderRetryDelay } from "./work-scheduler";
describe("durable order worker scheduling", () => {
  afterEach(() => vi.useRealTimers());
  it("backs off idle work, wakes for a mutation and disposes its timer", async () => {
    vi.useFakeTimers(); const work = vi.fn(async () => ({ count: 0 })); const stop = startOrderWorker(work);
    try { await vi.advanceTimersByTimeAsync(2000); expect(work).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(14999); expect(work).toHaveBeenCalledTimes(1);
      notifyOrderWork(); await vi.advanceTimersByTimeAsync(1000); expect(work).toHaveBeenCalledTimes(2);
      stop(); notifyOrderWork(); await vi.advanceTimersByTimeAsync(900000); expect(work).toHaveBeenCalledTimes(2);
    } finally { stop(); }
  });
  it("honours a persisted retry deadline and bounds exponential delays", async () => {
    vi.useFakeTimers(); const work = vi.fn(async () => ({ count: 0, nextAt: Date.now() + 4000 })); const stop = startOrderWorker(work);
    try { await vi.advanceTimersByTimeAsync(2000); await vi.advanceTimersByTimeAsync(4000); expect(work).toHaveBeenCalledTimes(2); } finally { stop(); }
    expect(orderRetryDelay(0)).toBe(10000); expect(orderRetryDelay(99)).toBe(900000);
  });
});
