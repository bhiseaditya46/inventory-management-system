import { getAuth } from "@clerk/express";
import type { RequestHandler } from "express";
import { db, adminUsersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export const requireAdmin: RequestHandler = async (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  const [admin] = await db
    .select({ clerkUserId: adminUsersTable.clerkUserId })
    .from(adminUsersTable)
    .where(eq(adminUsersTable.clerkUserId, userId))
    .limit(1);

  if (!admin) {
    res.status(403).json({ error: "Administrator access is required." });
    return;
  }

  next();
};
