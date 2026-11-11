import { defineConfig } from "drizzle-kit";
import { databaseConnectionConfig } from "./server/marketplace/database-config";
const raw = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
let connection: string | undefined;
if (raw) {
  const parsed = databaseConnectionConfig(raw);
  const url = new URL(raw);
  if (parsed.ssl) url.searchParams.set("sslmode", "verify-full");
  connection = url.toString();
}
// A separate migration history preserves the original MySQL database and rollback source.
export default defineConfig({
  schema: "./drizzle/postgres/schema.ts",
  out: "./drizzle/postgres/migrations",
  dialect: "postgresql",
  ...(connection ? { dbCredentials: { url: connection } } : {}),
});
