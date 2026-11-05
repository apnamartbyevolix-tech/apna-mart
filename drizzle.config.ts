import { defineConfig } from "drizzle-kit";
import { databaseConnectionConfig } from "./server/marketplace/database-config";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}
// Validate local/test targets before Drizzle Kit can reinterpret driver URL options.
databaseConnectionConfig(connectionString);

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
