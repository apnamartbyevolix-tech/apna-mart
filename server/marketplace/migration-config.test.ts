import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("PUBLIC_PREVIEW", "");
  vi.stubEnv("MTM_RUN_ISOLATED_DB_TESTS", "0");
  vi.stubEnv("MTM_ENABLE_DEV_AUTH", "0");
  vi.stubEnv("ALLOW_STANDALONE_DEV_LOGIN", "0");
});
afterEach(() => vi.unstubAllEnvs());

const loadConfig = () => import("../../drizzle.config");

describe("migration configuration isolation", () => {
  it.each([
    "postgresql://unit:unit@127.0.0.1/mtm_e2e_probe_test?host=remote.invalid&database=shared_shop",
    "postgresql://unit:unit@remote.invalid/mtm_e2e_probe_test",
    "postgresql://unit:unit@127.0.0.1/mtm_dev_demo",
    "postgresql://unit:unit@127.0.0.1/mtm_e2e_probe_test?socketPath=%2Ftmp%2Fshared.sock",
  ])("rejects unsafe test migration URLs during config import: %s", async url => {
    vi.stubEnv("MTM_RUN_ISOLATED_DB_TESTS", "1");
    vi.stubEnv("DATABASE_URL", url);
    await expect(loadConfig()).rejects.toThrow();
  });

  it("preserves a safe local PostgreSQL test URL", async () => {
    const url = "postgresql://unit:unit@127.0.0.1/mtm_e2e_probe_test";
    vi.stubEnv("MTM_RUN_ISOLATED_DB_TESTS", "1");
    vi.stubEnv("DATABASE_URL", url);
    expect((await loadConfig()).default.dbCredentials).toEqual({ url });
  });

  it.each(["MTM_ENABLE_DEV_AUTH", "ALLOW_STANDALONE_DEV_LOGIN"])("guards migration targets when %s is enabled", async flag => {
    vi.stubEnv(flag, "1");
    vi.stubEnv("DATABASE_URL", "postgresql://unit:unit@127.0.0.1/mtm_dev_demo?database=shared_shop");
    await expect(loadConfig()).rejects.toThrow(/options/);
  });

  it("does not change ordinary production migration configuration", async () => {
    const url = "postgresql://unit:unit@production.invalid/marketplace?sslmode=verify-full";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", url);
    expect((await loadConfig()).default.dbCredentials).toEqual({ url });
  });
});
