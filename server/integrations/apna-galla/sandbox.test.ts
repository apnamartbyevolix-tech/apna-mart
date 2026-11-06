import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { assertSandbox } from "./sandbox";
describe("Local Apna connector cannot become a production connector through a toggle", () => {
  beforeEach(() => {
    vi.stubEnv("MTM_APNA_SANDBOX_ENABLED", "1");
    vi.stubEnv("HOST", "127.0.0.1");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(
      "DATABASE_URL",
      "mysql://sandbox:private@127.0.0.1:3313/mtm_e2e_market_test"
    );
    vi.stubEnv("APNA_SANDBOX_URL", "https://localhost:8465/");
    vi.stubEnv("APNA_SANDBOX_KEY", "a".repeat(64));
    vi.stubEnv("APNA_SANDBOX_SECRET", "b".repeat(64));
  });
  afterEach(() => vi.unstubAllEnvs());
  it("permits a fully isolated explicitly configured sandbox", () =>
    expect(() => assertSandbox()).not.toThrow());
  it("rejects disabled activation", () => {
    vi.stubEnv("HOST", "0.0.0.0");
    expect(() => assertSandbox()).toThrow();
    vi.stubEnv("HOST", "127.0.0.1");
    vi.stubEnv("MTM_APNA_SANDBOX_ENABLED", "0");
    expect(() => assertSandbox()).toThrow();
  });
  it("rejects a production environment", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertSandbox()).toThrow();
  });
  it("rejects a production database even on localhost", () => {
    vi.stubEnv("DATABASE_URL", "mysql://sandbox:private@localhost/production");
    expect(() => assertSandbox()).toThrow();
  });
  it("rejects remote data sources", () => {
    vi.stubEnv(
      "DATABASE_URL",
      "mysql://sandbox:private@other.invalid/mtm_e2e_market_test"
    );
    expect(() => assertSandbox()).toThrow();
  });
  it("rejects untrusted peers and non-TLS requests", () => {
    for (const url of [
      "https://other.invalid/",
      "http://localhost:8465/",
      "https://name:private@localhost:8465/",
    ]) {
      vi.stubEnv("APNA_SANDBOX_URL", url);
      expect(() => assertSandbox()).toThrow();
    }
  });
  it("rejects missing server secrets", () => {
    vi.stubEnv("APNA_SANDBOX_SECRET", "");
    expect(() => assertSandbox()).toThrow();
  });
});
