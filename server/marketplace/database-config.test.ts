import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { databaseConnectionConfig, parseLocalDatabaseConfig } from "./database-config";
import { validateIntegrationDatabaseUrl } from "./integration-guard";

describe("effective local database configuration", () => {
  it.each([
    ["postgresql://user:pass@localhost:3307/mtm_e2e_demo_test", "localhost"],
    ["postgresql://user:pass@127.0.0.1/mtm_e2e_demo_test", "127.0.0.1"],
    ["postgres://user:pass@[::1]:3307/mtm_e2e_demo_test", "::1"],
  ])("passes validated options, rather than a reinterpretable URL: %s", (url, host) => {
    const options = parseLocalDatabaseConfig(url, "integration");
    // Pool construction parses the actual installed PostgreSQL configuration but opens no socket.
    const pool = new Pool(options);
    try {
      expect((pool.options as any)).toMatchObject({ host, database: "mtm_e2e_demo_test", user: "user", password: "pass" });
      expect((pool.options as any).port).toBe(url.includes(":3307") ? 3307 : 5432);
      expect((pool.options as any).socketPath).toBeUndefined();
      expect((pool.options as any).stream).toBeUndefined();
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
    const url = `postgresql://unit:unit@127.0.0.1/mtm_e2e_probe_test?${query}`;
    expect(() => parseLocalDatabaseConfig(url, "integration")).toThrow(/options/);
    expect(() => parseLocalDatabaseConfig(url, "development")).toThrow(/options/);
    expect(validateIntegrationDatabaseUrl(url).valid).toBe(false);
  });

  it("preserves percent-encoded credentials without URL overrides", () => {
    const options = parseLocalDatabaseConfig("postgresql://user:p%40ss%3Fhost%3Dremote.invalid@localhost/mtm_e2e_demo_test", "integration");
    expect(options).toMatchObject({ user: "user", password: "p@ss?host=remote.invalid", database: "mtm_e2e_demo_test" });
  });

  it.each(["mtm_dev", "mtm_devproduction", "mtm_dev_", "mtm_localprod", "mtm_test_live/other", "mtm_e2e_"])("requires exact prefix boundaries and a safe suffix: %s", name => {
    expect(() => parseLocalDatabaseConfig(`postgresql://localhost/${name}`, "development")).toThrow(/not permitted/);
  });

  it.each(["mtm_dev_demo", "mtm_local_demo", "mtm_test_demo", "mtm_e2e_demo_test"])("accepts the documented development database namespace: %s", name => {
    expect(parseLocalDatabaseConfig(`postgresql://127.0.0.1/${name}`, "development").database).toBe(name);
  });

  it.each([
    "postgresql://remote.invalid/mtm_e2e_demo_test",
    "mysql://localhost/mtm_e2e_demo_test",
    "postgresql://localhost/mtm_dev_demo",
    "postgresql://localhost/mtm_e2e_demo_test%2Fproduction",
    "postgresql://localhost/mtm_e2e_demo_test%00",
    "postgresql://localhost/mtm_e2e_demo_test#production",
    "postgresql://localhost:70000/mtm_e2e_demo_test",
    "postgresql://user:sentinel-password%ZZ@localhost/mtm_e2e_demo_test",
    "not-a-url-sentinel-password",
  ])("rejects unsafe or ambiguous test targets without echoing credentials", url => {
    const result = validateIntegrationDatabaseUrl(url);
    expect(result.valid).toBe(false);
    expect(result.reason).not.toContain("sentinel-password");
    expect(result.reason).not.toContain(url);
  });

  it("does not confuse the persistent demo database with the disposable test database", () => {
    const demo = "postgresql://localhost/mtm_dev_mytown_demo";
    expect(() => databaseConnectionConfig(demo, { NODE_ENV: "test", MTM_RUN_ISOLATED_DB_TESTS: "1" })).toThrow(/mtm_e2e_/);
    expect(databaseConnectionConfig(demo, { NODE_ENV: "development", MTM_ENABLE_DEV_AUTH: "1" })).toMatchObject({ database: "mtm_dev_mytown_demo" });
  });

  it.each([
    { NODE_ENV: "production", MTM_RUN_ISOLATED_DB_TESTS: "1" },
    { NODE_ENV: "test", MTM_RUN_ISOLATED_DB_TESTS: "1", PUBLIC_PREVIEW: "1" },
    { NODE_ENV: "production", MTM_ENABLE_DEV_AUTH: "1" },
    { NODE_ENV: "development", ALLOW_STANDALONE_DEV_LOGIN: "1", PUBLIC_PREVIEW: "1" },
  ])("refuses unsafe execution modes before pool creation", env => {
    expect(() => databaseConnectionConfig("postgresql://localhost/mtm_e2e_demo_test", env)).toThrow(/forbidden/);
  });

  it("preserves ordinary production connection behavior when local/test modes are disabled", () => {
    const url = "postgresql://user:pass@production.invalid/marketplace?sslmode=verify-full";
    expect(databaseConnectionConfig(url, { NODE_ENV: "production" })).toMatchObject({ host: "production.invalid", ssl: { rejectUnauthorized: true } });
  });
});
