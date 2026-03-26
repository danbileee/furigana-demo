// Server-only — never import in client bundles
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const url = process.env["TURSO_DATABASE_URL"]?.trim();
const authToken = process.env["TURSO_AUTH_TOKEN"];

if (!url) {
  throw new Error(
    "Missing required environment variable: TURSO_DATABASE_URL. Set it in .env or your deployment config.",
  );
}

if (authToken === undefined && !url.startsWith("file:")) {
  throw new Error(
    "Missing required environment variable: TURSO_AUTH_TOKEN. Set it in .env or your deployment config. (TURSO_AUTH_TOKEN may be empty for file: URLs.)",
  );
}

const client = createClient({
  url,
  authToken: authToken ?? "",
});

export const db = drizzle({ client, schema });
