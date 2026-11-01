import fs from "node:fs";
import path from "node:path";

export function loadRootEnv(): void {
  // If already set, do not reload
  if (process.env.DATABASE_URL && process.env.CLERK_SECRET_KEY) {
    return;
  }

  let curr = process.cwd();
  for (let i = 0; i < 5; i++) {
    const envPath = path.join(curr, ".env");
    if (fs.existsSync(envPath)) {
      if (typeof process.loadEnvFile === "function") {
        try {
          process.loadEnvFile(envPath);
        } catch {
          // ignore parsing error
        }
      }
      return;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
}

loadRootEnv();

