import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config();

// Application tables stay SQLite dialect (`drizzle-orm/sqlite-core`).
// drizzle-kit uses the turso dialect so DATABASE_URL + DATABASE_AUTH_TOKEN work
// with LibSQL (local `file:` URLs or a Turso database).
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "turso",
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:./data/spoke.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
