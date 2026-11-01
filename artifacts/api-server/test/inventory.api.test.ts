import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import {
  db,
  adminUsersTable,
  userProfilesTable,
  pool,
  productsTable,
  stockMovementsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import inventoryRouter from "../src/routes/inventory";
import adminRouter from "../src/routes/admin";

const userA = `test-user-a-${process.pid}`;
const userB = `test-user-b-${process.pid}`;
const adminUser = `test-admin-${process.pid}`;
const sharedSku = `SHARED-SKU-${process.pid}`;

let currentActiveUser = userA;

after(async () => {
  try {
    await db.delete(productsTable).where(
      inArray(productsTable.ownerUserId, [userA, userB, adminUser]),
    );
    await db.delete(userProfilesTable).where(
      inArray(userProfilesTable.clerkUserId, [userA, userB, adminUser]),
    );
    await db.delete(adminUsersTable).where(
      inArray(adminUsersTable.clerkUserId, [userA, userB, adminUser]),
    );
    await pool.end();
  } catch {
    // Ignore cleanup errors
  }
});

test("multi-tenant inventory API: ownership, isolation, stock movements, and admin management", async () => {
  // Set up user profiles
  await db
    .insert(userProfilesTable)
    .values([
      { clerkUserId: userA, email: "user-a@example.com", name: "User A", role: "user" },
      { clerkUserId: userB, email: "user-b@example.com", name: "User B", role: "user" },
      { clerkUserId: adminUser, email: "admin@example.com", name: "Admin", role: "admin" },
    ])
    .onConflictDoNothing();

  await db
    .insert(adminUsersTable)
    .values({ clerkUserId: adminUser, email: "admin@example.com" })
    .onConflictDoNothing();

  const app = express();
  app.use(express.json());
  app.use(clerkMiddleware());
  app.use((req, _res, next) => {
    const clerkAuth = (req as typeof req & { auth?: (options?: unknown) => Record<string, unknown> }).auth;
    if (clerkAuth) {
      const testAuth = (options?: unknown) => ({
        ...clerkAuth(options),
        userId: currentActiveUser,
        sessionClaims: { sub: currentActiveUser },
      });
      Object.defineProperty(testAuth, Symbol.for("@clerk/express.auth"), { value: true });
      Object.defineProperty(req, "auth", {
        configurable: true,
        value: testAuth,
      });
    }
    next();
  });
  app.use("/api", inventoryRouter);
  app.use("/api", adminRouter);

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  try {
    // 1. User A creates a product
    currentActiveUser = userA;
    const createResA = await fetch(`${baseUrl}/products`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sku: sharedSku,
        name: "User A Gadget",
        category: "Gadgets",
        quantity: 10,
        reorderLevel: 5,
        unitPrice: 19.99,
        costPrice: 9.50,
        description: "User A private item",
        supplier: "Supplier A",
      }),
    });
    assert.equal(createResA.status, 201);
    const productA = (await createResA.json()) as { id: number; sku: string; ownerUserId: string };
    assert.equal(productA.sku, sharedSku);
    assert.equal(productA.ownerUserId, userA);

    // 2. User A cannot create a duplicate SKU in their own inventory
    const dupRes = await fetch(`${baseUrl}/products`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sku: sharedSku.toLowerCase(),
        name: "User A Duplicate",
        category: "Gadgets",
        quantity: 1,
        reorderLevel: 1,
        unitPrice: 10,
      }),
    });
    assert.equal(dupRes.status, 409);

    // 3. User B CAN create a product with the same SKU in their OWN inventory!
    currentActiveUser = userB;
    const createResB = await fetch(`${baseUrl}/products`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sku: sharedSku,
        name: "User B Gadget",
        category: "Gadgets",
        quantity: 3,
        reorderLevel: 2,
        unitPrice: 24.99,
        costPrice: 12.00,
      }),
    });
    assert.equal(createResB.status, 201);
    const productB = (await createResB.json()) as { id: number; sku: string; ownerUserId: string };
    assert.equal(productB.sku, sharedSku);
    assert.equal(productB.ownerUserId, userB);

    // 4. Isolation: User B CANNOT see User A's product
    const getProductAFromUserB = await fetch(`${baseUrl}/products/${productA.id}`);
    assert.equal(getProductAFromUserB.status, 404);

    // User B CANNOT edit User A's product
    const updateProductAFromUserB = await fetch(`${baseUrl}/products/${productA.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Hacked by B" }),
    });
    assert.equal(updateProductAFromUserB.status, 404);

    // User B CANNOT delete User A's product
    const deleteProductAFromUserB = await fetch(`${baseUrl}/products/${productA.id}`, {
      method: "DELETE",
    });
    assert.equal(deleteProductAFromUserB.status, 404);

    // 5. Stock movements: User A adjusts stock
    currentActiveUser = userA;
    const adjustRes = await fetch(`${baseUrl}/products/${productA.id}/stock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta: -6, note: "Sold 6 units" }),
    });
    assert.equal(adjustRes.status, 200);
    const adjusted = (await adjustRes.json()) as {
      product: { quantity: number };
      movement: { delta: number; note: string };
    };
    assert.equal(adjusted.product.quantity, 4);
    assert.equal(adjusted.movement.delta, -6);

    // 6. User A views movements for product A
    const movementsRes = await fetch(`${baseUrl}/products/${productA.id}/movements`);
    assert.equal(movementsRes.status, 200);
    const movements = (await movementsRes.json()) as Array<{ delta: number }>;
    assert.equal(movements.length, 1);
    assert.equal(movements[0].delta, -6);

    // 7. Dashboard summary: User A sees only User A's data
    const summaryResA = await fetch(`${baseUrl}/dashboard/summary`);
    assert.equal(summaryResA.status, 200);
    const summaryA = (await summaryResA.json()) as {
      productCount: number;
      totalUnits: number;
      lowStockCount: number;
      inventoryValue: number;
      totalCostValue: number;
    };
    assert.equal(summaryA.productCount, 1);
    assert.equal(summaryA.totalUnits, 4);
    assert.equal(summaryA.lowStockCount, 1); // 4 <= 5 reorder level
    assert.equal(summaryA.inventoryValue, 4 * 19.99);
    assert.equal(summaryA.totalCostValue, 4 * 9.50);

    // 8. Admin User sees all products or admin user list
    currentActiveUser = adminUser;
    const adminUsersRes = await fetch(`${baseUrl}/admin/users`);
    assert.equal(adminUsersRes.status, 200);
    const usersList = (await adminUsersRes.json()) as Array<{ clerkUserId: string; productCount: number }>;
    assert.ok(usersList.some((u) => u.clerkUserId === userA));
    assert.ok(usersList.some((u) => u.clerkUserId === userB));

    // Normal User B cannot access admin users
    currentActiveUser = userB;
    const forbiddenRes = await fetch(`${baseUrl}/admin/users`);
    assert.equal(forbiddenRes.status, 403);

    // Clean up products
    currentActiveUser = userA;
    const delA = await fetch(`${baseUrl}/products/${productA.id}`, { method: "DELETE" });
    assert.equal(delA.status, 204);

    currentActiveUser = userB;
    const delB = await fetch(`${baseUrl}/products/${productB.id}`, { method: "DELETE" });
    assert.equal(delB.status, 204);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
