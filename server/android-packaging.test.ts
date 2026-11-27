import { afterEach, describe, expect, it, vi } from "vitest";

async function config(values: Record<string, string>) {
  vi.resetModules();
  for (const key of ["MTM_ANDROID_RELEASE", "MTM_ANDROID_LIVE_TEST", "MTM_ANDROID_PREVIEW_URL"])
    vi.stubEnv(key, values[key] || "");
  return (await import("../capacitor.config")).default;
}

afterEach(() => vi.unstubAllEnvs());

describe("Android production origin boundary", () => {
  it("permits this isolated preview only for a debug build", async () => {
    expect((await config({ MTM_ANDROID_PREVIEW_URL: "http://127.0.0.1:5210" })).server).toEqual({ url: "http://127.0.0.1:5210", cleartext: true });
    await expect(config({ MTM_ANDROID_RELEASE: "1", MTM_ANDROID_PREVIEW_URL: "http://127.0.0.1:5210" })).rejects.toThrow();
  });
  it("pins the owner-selected package and HTTPS storefront in release mode", async () => {
    const result = await config({ MTM_ANDROID_RELEASE: "1" });
    expect(result.appId).toBe("in.apnamart.app");
    expect(result.appName).toBe("Apna Mart");
    expect(result.server).toEqual({ url: "https://apna-mart.in", cleartext: false });
    expect(result.android?.allowMixedContent).toBe(false);
  });
  it("refuses a localhost preview inside a release", async () => {
    await expect(config({ MTM_ANDROID_RELEASE: "1", MTM_ANDROID_PREVIEW_URL: "http://127.0.0.1:5206" })).rejects.toThrow();
  });
  it("refuses simultaneous live-test and release modes", async () => {
    await expect(config({ MTM_ANDROID_RELEASE: "1", MTM_ANDROID_LIVE_TEST: "1" })).rejects.toThrow();
  });
  it("refuses an unapproved preview origin", async () => {
    await expect(config({ MTM_ANDROID_PREVIEW_URL: "https://untrusted.invalid" })).rejects.toThrow();
  });
  it("leaves development without a remote production origin by default", async () => {
    expect((await config({})).server?.url).toBeUndefined();
  });
});
