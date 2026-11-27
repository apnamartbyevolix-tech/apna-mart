import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedFetch } from "./request";
describe("bounded API requests", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
  it("aborts a stalled API wait without retrying", async () => {
    vi.useFakeTimers(); const send = vi.fn((_input, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)))); vi.stubGlobal("fetch", send);
    const result = expect(boundedFetch("https://example.invalid/")).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(15000); await result; expect(send).toHaveBeenCalledTimes(1);
  });
  it("retains caller cancellation and clears its timeout", async () => {
    vi.useFakeTimers(); const source = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_input, init) => new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)))));
    const result = expect(boundedFetch("https://example.invalid/", { signal: source.signal })).rejects.toMatchObject({ name: "AbortError" }); source.abort(); await result; expect(vi.getTimerCount()).toBe(0);
  });
});
