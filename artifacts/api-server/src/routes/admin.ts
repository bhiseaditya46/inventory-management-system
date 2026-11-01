import { clerkClient, getAuth } from "@clerk/express";
import { db, adminUsersTable } from "@workspace/db";
import {
  BootstrapAdminResponse,
  GetAdminAccessResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

async function getPrimaryEmail(userId: string): Promise<string | null> {
  const user = await clerkClient.users.getUser(userId);
  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId,
  );
  return primaryEmail?.emailAddress.trim().toLowerCase() ?? null;
}

function approvedAdminEmail(): string | null {
  return process.env.ADMIN_EMAIL?.trim().toLowerCase() || null;
}

router.get("/auth/admin-access", async (req, res): Promise<void> => {
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
  const email = await getPrimaryEmail(userId);

  res.json(
    GetAdminAccessResponse.parse({
      isAdmin: Boolean(admin),
      registrationAllowed: Boolean(email && email === approvedAdminEmail()),
    }),
  );
});

router.post("/auth/bootstrap-admin", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  const email = await getPrimaryEmail(userId);
  const approvedEmail = approvedAdminEmail();
  if (!email || !approvedEmail || email !== approvedEmail) {
    res.json(
      BootstrapAdminResponse.parse({
        isAdmin: false,
        registrationAllowed: false,
      }),
    );
    return;
  }

  await db
    .insert(adminUsersTable)
    .values({ clerkUserId: userId, email })
    .onConflictDoNothing({ target: adminUsersTable.clerkUserId });

  const [admin] = await db
    .select({ clerkUserId: adminUsersTable.clerkUserId })
    .from(adminUsersTable)
    .where(eq(adminUsersTable.clerkUserId, userId))
    .limit(1);

  res.json(
    BootstrapAdminResponse.parse({
      isAdmin: Boolean(admin),
      registrationAllowed: Boolean(admin),
    }),
  );
});

export default router;
