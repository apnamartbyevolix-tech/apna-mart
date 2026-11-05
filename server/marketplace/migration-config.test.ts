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
    "mysql://unit:unit@127.0.0.1/mtm_e2e_probe?host=remote.invalid&database=shared_shop",
    "mysql://unit:unit@remote.invalid/mtm_e2e_probe",
    "mysql://unit:unit@127.0.0.1/mtm_dev_demo",
    "mysql://unit:unit@127.0.0.1/mtm_e2e_probe?socketPath=%2Ftmp%2Fshared.sock",
  ])("rejects unsafe test migration URLs during config import: %s", async url => {
    vi.stubEnv("MTM_RUN_ISOLATED_DB_TESTS", "1");
    vi.stubEnv("DATABASE_URL", url);
    await expect(loadConfig()).rejects.toThrow();
  });

  it("preserves a safe local test URL and its existing charset handling", async () => {
    const url = "mysql://unit:unit@127.0.0.1/mtm_e2e_probe?charset=utf8mb4";
    vi.stubEnv("MTM_RUN_ISOLATED_DB_TESTS", "1");
    vi.stubEnv("DATABASE_URL", url);
    expect((await loadConfig()).default.dbCredentials).toEqual({ url });
  });

  it.each(["MTM_ENABLE_DEV_AUTH", "ALLOW_STANDALONE_DEV_LOGIN"])("guards migration targets when %s is enabled", async flag => {
    vi.stubEnv(flag, "1");
    vi.stubEnv("DATABASE_URL", "mysql://unit:unit@127.0.0.1/mtm_dev_demo?database=shared_shop");
    await expect(loadConfig()).rejects.toThrow(/options/);
  });

  it("does not change ordinary production migration configuration", async () => {
    const url = "mysql://unit:unit@production.invalid/marketplace?ssl=true";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", url);
    expect((await loadConfig()).default.dbCredentials).toEqual({ url });
  });
});
