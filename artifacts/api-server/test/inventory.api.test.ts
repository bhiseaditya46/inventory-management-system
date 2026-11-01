import assert from "node:assert/strict";
import { after, test } from "node:test";
import express from "express";
import { clerkMiddleware } from "@clerk/express";
import { db, adminUsersTable, pool, productsTable, stockMovementsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import inventoryRouter from "../src/routes/inventory";

const testUserId = `inventory-api-test-${process.pid}`;
const testSku = `INV-API-TEST-${process.pid}`;

after(async () => {
  await pool.end();
});

test("authenticated inventory API supports product, stock, filter, summary, and report flows", async () => {
  await db
    .insert(adminUsersTable)
    .values({ clerkUserId: testUserId, email: "inventory-api-test@example.invalid" })
    .onConflictDoNothing({ target: adminUsersTable.clerkUserId });

  const app = express();
  app.use(express.json());
  app.use(clerkMiddleware());
  app.use((req, _res, next) => {
    const clerkAuth = (req as typeof req & { auth?: (options?: unknown) => Record<string, unknown> }).auth;
    if (clerkAuth) {
      const testAuth = (options?: unknown) => ({
        ...clerkAuth(options),
        userId: testUserId,
        sessionClaims: {},
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

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}/api`;

  try {
    const createResponse = await fetch(`${baseUrl}/products`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sku: testSku,
        name: "API verification item",
        category: "Verification",
        quantity: 7,
        reorderLevel: 4,
        unitPrice: 3.25,
        description: "Temporary endpoint test record",
        supplier: "Test supplier",
      }),
    });
    assert.equal(createResponse.status, 201);
    const created = (await createResponse.json()) as { id: number; sku: string };
    assert.equal(created.sku, testSku);

    const listResponse = await fetch(
      `${baseUrl}/products?search=${encodeURIComponent(testSku)}`,
    );
    assert.equal(listResponse.status, 200);
    const listed = (await listResponse.json()) as Array<{ id: number }>;
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.id, created.id);

    const duplicateResponse = await fetch(`${baseUrl}/products`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sku: testSku.toLowerCase(),
        name: "Duplicate SKU",
        category: "Verification",
        quantity: 1,
        reorderLevel: 1,
        unitPrice: 1,
      }),
    });
    assert.equal(duplicateResponse.status, 409);

    const updateResponse = await fetch(`${baseUrl}/products/${created.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Updated API verification item",
        reorderLevel: 5,
        unitPrice: 4.5,
      }),
    });
    assert.equal(updateResponse.status, 200);
    const updated = (await updateResponse.json()) as { name: string; unitPrice: number };
    assert.equal(updated.name, "Updated API verification item");
    assert.equal(updated.unitPrice, 4.5);

    const lowStockResponse = await fetch(`${baseUrl}/products?stockStatus=low`);
    assert.equal(lowStockResponse.status, 200);
    const lowStock = (await lowStockResponse.json()) as Array<{ sku: string }>;
    assert.ok(lowStock.some((product) => product.sku === testSku) === false);

    const reduceStockResponse = await fetch(`${baseUrl}/products/${created.id}/stock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta: -4, note: "API integration test" }),
    });
    assert.equal(reduceStockResponse.status, 200);
    const adjusted = (await reduceStockResponse.json()) as {
      product: { quantity: number };
      movement: { delta: number };
    };
    assert.equal(adjusted.product.quantity, 3);
    assert.equal(adjusted.movement.delta, -4);

    const lowStockListResponse = await fetch(`${baseUrl}/products/low-stock`);
    const lowStockList = (await lowStockListResponse.json()) as Array<{ sku: string }>;
    assert.ok(lowStockList.some((product) => product.sku === testSku));

    const stockFilterResponse = await fetch(`${baseUrl}/products?stockStatus=low`);
    const filteredLowStock = (await stockFilterResponse.json()) as Array<{ sku: string }>;
    assert.ok(filteredLowStock.some((product) => product.sku === testSku));

    const invalidAdjustment = await fetch(`${baseUrl}/products/${created.id}/stock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta: -99 }),
    });
    assert.equal(invalidAdjustment.status, 400);

    const summaryResponse = await fetch(`${baseUrl}/dashboard/summary`);
    assert.equal(summaryResponse.status, 200);
    const summary = (await summaryResponse.json()) as {
      productCount: number;
      lowStockCount: number;
      inventoryValue: number;
    };
    assert.ok(summary.productCount >= 1);
    assert.ok(summary.lowStockCount >= 1);
    assert.ok(summary.inventoryValue >= 3 * 4.5);

    const reportResponse = await fetch(`${baseUrl}/reports/inventory.csv`);
    assert.equal(reportResponse.status, 200);
    assert.match(reportResponse.headers.get("content-type") ?? "", /text\/csv/);
    assert.match(await reportResponse.text(), new RegExp(testSku));

    const productRow = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, testSku))
      .limit(1);
    assert.equal(productRow.length, 1);

    const deleteResponse = await fetch(`${baseUrl}/products/${created.id}`, {
      method: "DELETE",
    });
    assert.equal(deleteResponse.status, 204);

    const missingProduct = await fetch(`${baseUrl}/products/${created.id}`);
    assert.equal(missingProduct.status, 404);
    const remainingMovements = await db
      .select({ id: stockMovementsTable.id })
      .from(stockMovementsTable)
      .where(eq(stockMovementsTable.productId, created.id));
    assert.equal(remainingMovements.length, 0);
  } finally {
    await db.delete(productsTable).where(eq(productsTable.sku, testSku));
    await db
      .delete(adminUsersTable)
      .where(eq(adminUsersTable.clerkUserId, testUserId));
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
