import { createPool } from "mysql2";
import { describe, expect, it } from "vitest";
import { databaseConnectionConfig, parseLocalDatabaseConfig } from "./database-config";
import { validateIntegrationDatabaseUrl } from "./integration-guard";

describe("effective local database configuration", () => {
  it.each([
    ["mysql://user:pass@localhost:3307/mtm_e2e_demo", "localhost"],
    ["mysql2://user:pass@127.0.0.1/mtm_e2e_demo", "127.0.0.1"],
    ["mariadb://user:pass@[::1]:3307/mtm_e2e_demo", "::1"],
  ])("passes validated options, rather than a reinterpretable URL: %s", (url, host) => {
    const options = parseLocalDatabaseConfig(url, "integration");
    // Pool construction parses the actual installed mysql2 configuration but opens no socket.
    const pool = createPool(options);
    try {
      expect(pool.config.connectionConfig).toMatchObject({ host, database: "mtm_e2e_demo", user: "user", password: "pass" });
      expect(pool.config.connectionConfig.port).toBe(url.includes(":3307") ? 3307 : 3306);
      expect(pool.config.connectionConfig.socketPath).toBeUndefined();
      expect(pool.config.connectionConfig.stream).toBeUndefined();
    } finally {
      pool.end();
    }
  });

  it.each([
    "host=remote.invalid&database=shared_shop",
    "database=production",
    "port=3306",
    "socketPath=%2Ftmp%2Fshared-mysql.sock",
    "stream=%7B%7D",
    "uri=mysql%3A%2F%2Fremote.invalid%2Fproduction",
    "user=root",
    "password=override",
    "multipleStatements=true",
    "ssl=%7B%7D",
    "charset=utf8mb4&charset=latin1",
    "charset=%7B%22host%22%3A%22remote.invalid%22%7D",
  ])("rejects target/transport/unapproved driver options: %s", query => {
    const url = `mysql://unit:unit@127.0.0.1/mtm_e2e_probe?${query}`;
    expect(() => parseLocalDatabaseConfig(url, "integration")).toThrow(/options/);
    expect(() => parseLocalDatabaseConfig(url, "development")).toThrow(/options/);
    expect(validateIntegrationDatabaseUrl(url).valid).toBe(false);
  });

  it("preserves a single safe charset and percent-encoded credentials", () => {
    const options = parseLocalDatabaseConfig("mysql://user:p%40ss%3Fhost%3Dremote.invalid@localhost/mtm_e2e_demo?charset=utf8mb4", "integration");
    expect(options).toMatchObject({ user: "user", password: "p@ss?host=remote.invalid", database: "mtm_e2e_demo", charset: "utf8mb4" });
  });

  it.each(["mtm_dev", "mtm_devproduction", "mtm_dev_", "mtm_localprod", "mtm_test_live/other", "mtm_e2e_"])("requires exact prefix boundaries and a safe suffix: %s", name => {
    expect(() => parseLocalDatabaseConfig(`mysql://localhost/${name}`, "development")).toThrow(/not permitted/);
  });

  it.each(["mtm_dev_demo", "mtm_local_demo", "mtm_test_demo", "mtm_e2e_demo"])("accepts the documented development database namespace: %s", name => {
    expect(parseLocalDatabaseConfig(`mysql://127.0.0.1/${name}`, "development").database).toBe(name);
  });

  it.each([
    "mysql://remote.invalid/mtm_e2e_demo",
    "postgres://localhost/mtm_e2e_demo",
    "mysql://localhost/mtm_dev_demo",
    "mysql://localhost/mtm_e2e_demo%2Fproduction",
    "mysql://localhost/mtm_e2e_demo%00",
    "mysql://localhost/mtm_e2e_demo#production",
    "mysql://localhost:70000/mtm_e2e_demo",
    "mysql://user:sentinel-password%ZZ@localhost/mtm_e2e_demo",
    "not-a-url-sentinel-password",
  ])("rejects unsafe or ambiguous test targets without echoing credentials", url => {
    const result = validateIntegrationDatabaseUrl(url);
    expect(result.valid).toBe(false);
    expect(result.reason).not.toContain("sentinel-password");
    expect(result.reason).not.toContain(url);
  });

  it("does not confuse the persistent demo database with the disposable test database", () => {
    const demo = "mysql://localhost/mtm_dev_mytown_demo";
    expect(() => databaseConnectionConfig(demo, { NODE_ENV: "test", MTM_RUN_ISOLATED_DB_TESTS: "1" })).toThrow(/mtm_e2e_/);
    expect(databaseConnectionConfig(demo, { NODE_ENV: "development", MTM_ENABLE_DEV_AUTH: "1" })).toMatchObject({ database: "mtm_dev_mytown_demo" });
  });

  it.each([
    { NODE_ENV: "production", MTM_RUN_ISOLATED_DB_TESTS: "1" },
    { NODE_ENV: "test", MTM_RUN_ISOLATED_DB_TESTS: "1", PUBLIC_PREVIEW: "1" },
    { NODE_ENV: "production", MTM_ENABLE_DEV_AUTH: "1" },
    { NODE_ENV: "development", ALLOW_STANDALONE_DEV_LOGIN: "1", PUBLIC_PREVIEW: "1" },
  ])("refuses unsafe execution modes before pool creation", env => {
    expect(() => databaseConnectionConfig("mysql://localhost/mtm_e2e_demo", env)).toThrow(/forbidden/);
  });

  it("preserves ordinary production connection behavior when local/test modes are disabled", () => {
    const url = "mysql://user:pass@production.invalid/marketplace?ssl=true";
    expect(databaseConnectionConfig(url, { NODE_ENV: "production" })).toBe(url);
  });
});
