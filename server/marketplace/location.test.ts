import { describe, expect, it, vi } from "vitest";
import { createLocationLookup } from "./location";
const response = () =>
  new Response(
    JSON.stringify({ address: { country_code: "in", postcode: "458226" } })
  );
describe("optional pincode lookup", () => {
  it("caps uncached provider attempts per process while preserving cached and manual choices", async () => {
    let time = Date.parse("2026-11-27T00:00:00Z");
    const send = vi.fn(async () => response()), lookup = createLocationLookup(send, () => time, 1);
    await lookup({ latitude: 1, longitude: 1 }); time += 1000;
    await expect(lookup({ latitude: 2, longitude: 2 })).rejects.toThrow("BUSY");
    await expect(lookup({ latitude: 1, longitude: 1 })).resolves.toEqual({ postalCode: "458226" });
    time += 86400000; await lookup({ latitude: 2, longitude: 2 });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed coordinates before any provider request", async () => {
    const send = vi.fn();
    const lookup = createLocationLookup(send);
    await expect(lookup({ latitude: 999, longitude: 1 })).rejects.toThrow();
    await expect(
      lookup({ latitude: 1, longitude: 1, url: "http://localhost" })
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
  it("uses one fixed provider, approximate coordinates and a bounded cache", async () => {
    const send = vi.fn(async () => response());
    const lookup = createLocationLookup(send);
    expect(await lookup({ latitude: 24.123456, longitude: 75.123456 })).toEqual(
      { postalCode: "458226" }
    );
    expect(await lookup({ latitude: 24.123457, longitude: 75.123457 })).toEqual(
      { postalCode: "458226" }
    );
    expect(send).toHaveBeenCalledTimes(1);
    const [url, options] = send.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe("https://nominatim.openstreetmap.org");
    expect(url.searchParams.get("lat")).toBe("24.12");
    expect(options.redirect).toBe("error");
  });
  it("never exceeds one request per second or retries on failure", async () => {
    let time = 10000;
    const send = vi.fn(async () => response());
    const lookup = createLocationLookup(send, () => time);
    await lookup({ latitude: 1, longitude: 1 });
    await expect(lookup({ latitude: 2, longitude: 2 })).rejects.toThrow("BUSY");
    time += 1000;
    await lookup({ latitude: 2, longitude: 2 });
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("fails safely for foreign areas, provider errors and oversized results", async () => {
    for (const value of [
      new Response("down", { status: 503 }),
      new Response(
        JSON.stringify({ address: { country_code: "us", postcode: "123456" } })
      ),
      new Response("x".repeat(32769)),
    ]) {
      const send = vi.fn(async () => value);
      await expect(
        createLocationLookup(send)({ latitude: 1, longitude: 1 })
      ).rejects.toThrow();
      expect(send).toHaveBeenCalledTimes(1);
    }
  });
});
