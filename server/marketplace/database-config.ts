import type { PoolOptions } from "mysql2";

export type LocalDatabasePurpose = "development" | "integration";

/** Parse once into driver options: mysql2 URL query parameters may override targets. */
export function parseLocalDatabaseConfig(
  rawUrl: string | undefined,
  purpose: LocalDatabasePurpose
): PoolOptions & { host: string; port: number; database: string } {
  if (!rawUrl) throw new Error("DATABASE_URL is missing or empty.");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Malformed database connection URL.");
  }
  if (!["mysql:", "mysql2:", "mariadb:"].includes(parsed.protocol))
    throw new Error("Invalid database protocol; expected mysql, mysql2 or mariadb.");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))
    throw new Error("Host is not permitted for destructive integration tests and is prohibited on remote or shared database hosts.");

  let database: string;
  let user: string;
  let password: string;
  try {
    database = decodeURIComponent(parsed.pathname.slice(1));
    user = decodeURIComponent(parsed.username);
    password = decodeURIComponent(parsed.password);
  } catch {
    throw new Error("Malformed database URL encoding.");
  }
  const prefix = purpose === "integration"
    ? /^mtm_e2e_[a-zA-Z0-9_]+$/
    : /^mtm_(?:dev|local|test|e2e)_[a-zA-Z0-9_]+$/;
  if (!prefix.test(database)) {
    if (purpose === "integration")
      throw new Error("Database name must start with 'mtm_e2e_' prefix and have an alphanumeric/underscore suffix.");
    const label = /^[a-zA-Z0-9_]+$/.test(database) ? `Database '${database}'` : "Database name";
    throw new Error(`${label} is not permitted for development authentication; expected mtm_dev_*, mtm_local_*, mtm_test_* or mtm_e2e_*.`);
  }
  if (parsed.hash)
    throw new Error("Database URL fragments are not permitted for local authentication or tests.");

  // Preserve the existing harmless charset option; never forward arbitrary driver options.
  let charset: string | undefined;
  for (const [name, value] of parsed.searchParams) {
    if (name !== "charset" || charset !== undefined || !/^[a-zA-Z0-9_]+$/.test(value))
      throw new Error("Database URL options are restricted to a single plain charset; target and transport overrides are forbidden.");
    charset = value;
  }
  const port = parsed.port ? Number(parsed.port) : 3306;
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Invalid local database port.");
  return {
    host: parsed.hostname === "[::1]" ? "::1" : parsed.hostname,
    port,
    database,
    user,
    password,
    ...(charset ? { charset } : {}),
  };
}

/** Production keeps its existing driver contract; local/test modes cannot bypass isolation. */
export function databaseConnectionConfig(
  rawUrl: string,
  env: NodeJS.ProcessEnv = process.env
): string | ReturnType<typeof parseLocalDatabaseConfig> {
  if (env.MTM_RUN_ISOLATED_DB_TESTS === "1") {
    if (env.NODE_ENV === "production" || env.PUBLIC_PREVIEW)
      throw new Error("Isolated database tests are forbidden in production or public preview.");
    return parseLocalDatabaseConfig(rawUrl, "integration");
  }
  if (env.MTM_ENABLE_DEV_AUTH === "1" || env.ALLOW_STANDALONE_DEV_LOGIN === "1") {
    if (env.NODE_ENV === "production" || env.PUBLIC_PREVIEW)
      throw new Error("Development authentication is forbidden in production or public preview.");
    return parseLocalDatabaseConfig(rawUrl, "development");
  }
  return rawUrl;
}
