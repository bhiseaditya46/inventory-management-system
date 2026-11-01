import "./env";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost:5432/stockroom",
  ssl: process.env.DATABASE_URL?.includes("sslmode=require") || process.env.DATABASE_URL?.includes("neon.tech") || process.env.DATABASE_URL?.includes("supabase.co")
    ? { rejectUnauthorized: false }
    : undefined,
});

export const db = drizzle(pool, { schema });

export * from "./schema";
