import { clerkClient, getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, adminUsersTable, userProfilesTable, productsTable, stockMovementsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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

export interface AuthExtraction {
  userId: string | null;
  email?: string;
  name?: string;
}

export function extractAuthFromRequest(req: Request): AuthExtraction {
  try {
    const auth = getAuth(req);
    if (auth?.userId) {
      const claims = (auth.sessionClaims || {}) as Record<string, any>;
      const email =
        claims.email ||
        claims.primary_email_address ||
        (Array.isArray(claims.email_addresses) ? claims.email_addresses[0] : undefined);
      const name =
        claims.name ||
        [claims.first_name, claims.last_name].filter(Boolean).join(" ") ||
        undefined;
      return { userId: auth.userId, email, name };
    }
  } catch (err) {
    logger.debug({ err }, "getAuth failed, trying bearer fallback");
  }

  // Fallback: decode JWT from Authorization Bearer header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const payloadStr = Buffer.from(parts[1], "base64url").toString("utf8");
        const payload = JSON.parse(payloadStr) as Record<string, any>;
        if (payload.sub) {
          const email =
            payload.email ||
            payload.primary_email_address ||
            (Array.isArray(payload.email_addresses)
              ? payload.email_addresses[0]
              : undefined);
          const name =
            payload.name ||
            [payload.first_name, payload.last_name].filter(Boolean).join(" ") ||
            undefined;
          return { userId: payload.sub, email, name };
        }
      }
    } catch (e) {
      logger.debug({ err: e }, "Failed to parse Authorization bearer token fallback");
    }
  }

  return { userId: null };
}

export async function syncUserProfile(
  userId: string,
  req?: Request,
  providedDetails?: { email?: string; name?: string },
): Promise<AuthenticatedUser> {
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
  let email = providedDetails?.email;
  let name = providedDetails?.name ?? null;

  if (!email) {
    const fromClerk = await resolveUserFromClerk(userId);
    email = fromClerk.email;
    name = name || fromClerk.name;
  }

  const approvedEmail = approvedAdminEmail();
  const shouldBeAdmin = Boolean(
    existingAdmin ||
      (email &&
        approvedEmail &&
        email.toLowerCase() === approvedEmail.toLowerCase()),
  );

  // Check if this email was previously manually created or seeded by an Admin
  if (email) {
    const [existingByEmail] = await db
      .select()
      .from(userProfilesTable)
      .where(sql`lower(${userProfilesTable.email}) = lower(${email})`)
      .limit(1);

    if (existingByEmail && existingByEmail.clerkUserId !== userId) {
      const oldId = existingByEmail.clerkUserId;
      const finalRole =
        existingByEmail.role === "admin" || shouldBeAdmin ? "admin" : "user";

      try {
        await db
          .update(userProfilesTable)
          .set({
            clerkUserId: userId,
            name: name || existingByEmail.name,
            role: finalRole,
            updatedAt: new Date(),
          })
          .where(eq(userProfilesTable.clerkUserId, oldId));

        await db
          .update(productsTable)
          .set({ ownerUserId: userId })
          .where(eq(productsTable.ownerUserId, oldId));

        await db
          .update(stockMovementsTable)
          .set({ userId })
          .where(eq(stockMovementsTable.userId, oldId));

        if (finalRole === "admin") {
          await db
            .insert(adminUsersTable)
            .values({ clerkUserId: userId, email })
            .onConflictDoNothing();
        }
      } catch (err) {
        logger.error(
          { err, userId, email },
          "Failed to re-link pre-created profile",
        );
      }

      return {
        userId,
        email: existingByEmail.email,
        name: name || existingByEmail.name,
        role: finalRole as "admin" | "user",
        isAdmin: finalRole === "admin",
      };
    }
  }

  const role = shouldBeAdmin ? "admin" : "user";

  try {
    await db
      .insert(userProfilesTable)
      .values({
        clerkUserId: userId,
        email: email || `${userId}@user.clerk`,
        name,
        role,
      })
      .onConflictDoUpdate({
        target: userProfilesTable.clerkUserId,
        set: { email: email || `${userId}@user.clerk`, name, updatedAt: new Date() },
      });

    if (shouldBeAdmin && email) {
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
    email: email || `${userId}@user.clerk`,
    name,
    role,
    isAdmin: shouldBeAdmin,
  };
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId, email, name } = extractAuthFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  try {
    const appUser = await syncUserProfile(userId, req, { email, name });
    req.appUser = appUser;
    next();
  } catch (error) {
    logger.error({ err: error, userId }, "Error during requireAuth");
    res.status(500).json({ error: "Authentication check failed." });
  }
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { userId, email, name } = extractAuthFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  try {
    const appUser =
      req.appUser || (await syncUserProfile(userId, req, { email, name }));
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
