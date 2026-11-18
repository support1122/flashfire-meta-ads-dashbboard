// Applies Google DB migrations during the build. Skips (does not fail the build) when
// GOOGLE_DATABASE_URL is not configured, so deploys work before the Google DB is wired up.
import { spawnSync } from "node:child_process";

if (!process.env.GOOGLE_DATABASE_URL) {
  console.log("[google-db] GOOGLE_DATABASE_URL not set — skipping Google DB migrations");
  process.exit(0);
}
const r = spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/google/schema.prisma"], { stdio: "inherit" });
process.exit(r.status ?? 1);
