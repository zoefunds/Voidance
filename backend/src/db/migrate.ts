import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Repo layout puts database/migrations three levels above backend/src/db in
// the source tree, but the Docker image (see backend/Dockerfile) flattens
// it to two levels above dist/db. Try both so `npm run migrate` works
// identically in local dev and in the deployed container.
const candidates: string[] = [
  path.resolve(__dirname, "../../../database/migrations"),
  path.resolve(__dirname, "../../database/migrations"),
];
const found = candidates.find(existsSync);
if (!found) {
  throw new Error(`could not locate database/migrations — tried: ${candidates.join(", ")}`);
}
const migrationsDir: string = found;

async function migrate() {
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    );
    for (const file of files) {
      const { rows } = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
      if (rows.length > 0) continue;
      const sql = readFileSync(path.join(migrationsDir, file), "utf8");
      console.log(`applying migration ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }
    console.log("migrations up to date");
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error("migration failed", err);
  process.exit(1);
});
