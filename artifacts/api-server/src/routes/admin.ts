import { getAuth } from "@clerk/express";
import {
  db,
  adminUsersTable,
  userProfilesTable,
  productsTable,
} from "@workspace/db";
import {
  BootstrapAdminResponse,
  GetAdminAccessResponse,
  GetCurrentUserResponse,
  ListAdminUsersResponse,
  UpdateUserRoleBody,
  UpdateUserRoleParams,
  UpdateUserRoleResponse,
} from "@workspace/api-zod";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  approvedAdminEmail,
  isUserAdmin,
  requireAdmin,
  requireAuth,
  resolveUserFromClerk,
  syncUserProfile,
} from "../middlewares/auth";

const router: IRouter = Router();

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = req.appUser!;
  res.json(
    GetCurrentUserResponse.parse({
      userId: user.userId,
      email: user.email,
      name: user.name,
      role: user.role,
      isAdmin: user.isAdmin,
    }),
  );
});

router.get("/auth/admin-access", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  const appUser = await syncUserProfile(userId, req);
  const approvedEmail = approvedAdminEmail();

  res.json(
    GetAdminAccessResponse.parse({
      isAdmin: appUser.isAdmin,
      registrationAllowed: Boolean(
        appUser.email && approvedEmail && appUser.email.toLowerCase() === approvedEmail,
      ),
      role: appUser.role,
    }),
  );
});

router.post("/auth/bootstrap-admin", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  const { email, name } = await resolveUserFromClerk(userId);
  const approvedEmail = approvedAdminEmail();

  if (!email || !approvedEmail || email.toLowerCase() !== approvedEmail) {
    res.json(
      BootstrapAdminResponse.parse({
        isAdmin: false,
        registrationAllowed: false,
        role: "user",
      }),
    );
    return;
  }

  await db
    .insert(adminUsersTable)
    .values({ clerkUserId: userId, email })
    .onConflictDoNothing({ target: adminUsersTable.clerkUserId });

  await db
    .insert(userProfilesTable)
    .values({ clerkUserId: userId, email, name, role: "admin" })
    .onConflictDoUpdate({
      target: userProfilesTable.clerkUserId,
      set: { role: "admin", updatedAt: new Date() },
    });

  res.json(
    BootstrapAdminResponse.parse({
      isAdmin: true,
      registrationAllowed: true,
      role: "admin",
    }),
  );
});

router.get("/admin/users", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      clerkUserId: userProfilesTable.clerkUserId,
      email: userProfilesTable.email,
      name: userProfilesTable.name,
      role: userProfilesTable.role,
      createdAt: userProfilesTable.createdAt,
      productCount: sql<number>`count(${productsTable.id})::int`,
    })
    .from(userProfilesTable)
    .leftJoin(
      productsTable,
      eq(userProfilesTable.clerkUserId, productsTable.ownerUserId),
    )
    .groupBy(
      userProfilesTable.clerkUserId,
      userProfilesTable.email,
      userProfilesTable.name,
      userProfilesTable.role,
      userProfilesTable.createdAt,
    )
    .orderBy(userProfilesTable.createdAt);

  res.json(
    ListAdminUsersResponse.parse(
      rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
    ),
  );
});

router.patch("/admin/users/:userId/role", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateUserRoleParams.safeParse(req.params);
  const parsed = UpdateUserRoleBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "Invalid role update request." });
    return;
  }

  const targetUserId = params.data.userId;
  const newRole = parsed.data.role;

  const [existing] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.clerkUserId, targetUserId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  await db
    .update(userProfilesTable)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(userProfilesTable.clerkUserId, targetUserId));

  if (newRole === "admin") {
    await db
      .insert(adminUsersTable)
      .values({ clerkUserId: targetUserId, email: existing.email })
      .onConflictDoNothing({ target: adminUsersTable.clerkUserId });
  } else {
    await db
      .delete(adminUsersTable)
      .where(eq(adminUsersTable.clerkUserId, targetUserId));
  }

  const [productCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productsTable)
    .where(eq(productsTable.ownerUserId, targetUserId));

  res.json(
    UpdateUserRoleResponse.parse({
      clerkUserId: existing.clerkUserId,
      email: existing.email,
      name: existing.name,
      role: newRole,
      productCount: Number(productCountRow?.count ?? 0),
      createdAt: existing.createdAt.toISOString(),
    }),
  );
});

export default router;
