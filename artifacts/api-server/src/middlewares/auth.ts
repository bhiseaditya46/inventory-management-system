import { clerkClient, getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, adminUsersTable, userProfilesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  isAdmin: boolean;
}

declare global {
  namespace Express {
    interface Request {
      appUser?: AuthenticatedUser;
    }
  }
}

export function approvedAdminEmail(): string | null {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
}

export async function resolveUserFromClerk(userId: string): Promise<{ email: string; name: string | null }> {
  try {
    const user = await clerkClient.users.getUser(userId);
    const primary = user.emailAddresses.find(
      (e) => e.id === user.primaryEmailAddressId,
    );
    const email = primary?.emailAddress.trim().toLowerCase() || `${userId}@user.clerk`;
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || null;
    return { email, name };
  } catch (error) {
    logger.debug({ err: error, userId }, "Could not fetch user details from Clerk client, using fallback");
    return { email: `${userId}@user.clerk`, name: null };
  }
}

export async function isUserAdmin(userId: string): Promise<boolean> {
  const [adminRow] = await db
    .select({ clerkUserId: adminUsersTable.clerkUserId })
    .from(adminUsersTable)
    .where(eq(adminUsersTable.clerkUserId, userId))
    .limit(1);

  if (adminRow) return true;

  const [profileRow] = await db
    .select({ role: userProfilesTable.role })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkUserId, userId))
    .limit(1);

  return profileRow?.role === "admin";
}

export async function syncUserProfile(userId: string, req?: Request): Promise<AuthenticatedUser> {
  // Check if profile exists
  const [existing] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkUserId, userId))
    .limit(1);

  // Check admin table
  const [existingAdmin] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.clerkUserId, userId))
    .limit(1);

  if (existing) {
    const isAdmin = existing.role === "admin" || Boolean(existingAdmin);
    return {
      userId,
      email: existing.email,
      name: existing.name,
      role: isAdmin ? "admin" : "user",
      isAdmin,
    };
  }

  // If first time seeing this user, get info and check if they match approved admin
  const { email, name } = await resolveUserFromClerk(userId);
  const approvedEmail = approvedAdminEmail();
  const shouldBeAdmin = Boolean(
    existingAdmin ||
    (email && approvedEmail && email.toLowerCase() === approvedEmail.toLowerCase()),
  );

  const role = shouldBeAdmin ? "admin" : "user";

  try {
    await db
      .insert(userProfilesTable)
      .values({
        clerkUserId: userId,
        email,
        name,
        role,
      })
      .onConflictDoUpdate({
        target: userProfilesTable.clerkUserId,
        set: { email, name, updatedAt: new Date() },
      });

    if (shouldBeAdmin) {
      await db
        .insert(adminUsersTable)
        .values({ clerkUserId: userId, email })
        .onConflictDoNothing({ target: adminUsersTable.clerkUserId });
    }
  } catch (error) {
    logger.error({ err: error, userId }, "Failed to upsert user profile");
  }

  return {
    userId,
    email,
    name,
    role,
    isAdmin: shouldBeAdmin,
  };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  try {
    const appUser = await syncUserProfile(userId, req);
    req.appUser = appUser;
    next();
  } catch (error) {
    logger.error({ err: error, userId }, "Error during requireAuth");
    res.status(500).json({ error: "Authentication check failed." });
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  try {
    const appUser = req.appUser || (await syncUserProfile(userId, req));
    req.appUser = appUser;

    if (!appUser.isAdmin) {
      res.status(403).json({ error: "Administrator access is required." });
      return;
    }

    next();
  } catch (error) {
    logger.error({ err: error, userId }, "Error during requireAdmin");
    res.status(500).json({ error: "Authorization check failed." });
  }
}
