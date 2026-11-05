import { parseLocalDatabaseConfig } from "./database-config";

/**
 * Parse and strictly validate the integration test database connection URL.
 * Requires:
 * 1. Protocol must be mysql, mysql2, or mariadb.
 * 2. Host must be strictly local (localhost, 127.0.0.1, ::1).
 * 3. Database name must explicitly start with 'mtm_e2e_'.
 * 4. Substring matches across the entire URL are forbidden.
 */
export function validateIntegrationDatabaseUrl(rawUrl: string | undefined): {
  valid: boolean;
  reason?: string;
  dbName?: string;
  host?: string;
} {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, reason: "DATABASE_URL is missing or empty." };
  }
  try {
    const config = parseLocalDatabaseConfig(rawUrl, "integration");
    return { valid: true, dbName: config.database, host: config.host };
  } catch (err) {
    return {
      valid: false,
      reason: err instanceof Error ? err.message : "Invalid local test database configuration.",
    };
  }
}

