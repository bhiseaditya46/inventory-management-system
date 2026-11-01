import {
  AdjustProductStockBody,
  AdjustProductStockParams,
  AdjustProductStockResponse,
  CreateProductBody,
  CreateProductResponse,
  DeleteProductParams,
  GetDashboardSummaryResponse,
  GetProductParams,
  GetProductResponse,
  ListLowStockProductsResponse,
  ListProductsQueryParams,
  ListProductsResponse,
  ListProductMovementsParams,
  ListProductMovementsResponse,
  ListRecentMovementsQueryParams,
  ListRecentMovementsResponse,
  UpdateProductBody,
  UpdateProductParams,
  UpdateProductResponse,
} from "@workspace/api-zod";
import {
  db,
  productsTable,
  stockMovementsTable,
} from "@workspace/db";
import { and, desc, eq, gt, ilike, lte, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireAuth);

function serializeProduct(product: typeof productsTable.$inferSelect) {
  return {
    ...product,
    unitPrice: Number(product.unitPrice),
    costPrice: Number(product.costPrice),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<object>();
  let current = error;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    if ("code" in current && current.code === "23505") {
      return true;
    }
    seen.add(current);
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

router.get("/products", async (req, res): Promise<void> => {
  const query = ListProductsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const user = req.appUser!;
  const conditions = [];

  // Enforce ownership: normal users only see their own products
  if (!user.isAdmin) {
    conditions.push(eq(productsTable.ownerUserId, user.userId));
  }

  const { search, category, stockStatus } = query.data;

  if (search?.trim()) {
    const term = `%${escapeLike(search.trim())}%`;
    conditions.push(
      sql`(${productsTable.name} ILIKE ${term} OR ${productsTable.sku} ILIKE ${term} OR ${productsTable.category} ILIKE ${term} OR ${productsTable.supplier} ILIKE ${term})`,
    );
  }
  if (category?.trim()) {
    conditions.push(eq(productsTable.category, category.trim()));
  }
  if (stockStatus === "low") {
    conditions.push(
      and(
        gt(productsTable.quantity, 0),
        lte(productsTable.quantity, productsTable.reorderLevel),
      ),
    );
  } else if (stockStatus === "out") {
    conditions.push(eq(productsTable.quantity, 0));
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(productsTable.updatedAt), desc(productsTable.id));

  res.json(ListProductsResponse.parse(products.map(serializeProduct)));
});

router.get("/products/low-stock", async (req, res): Promise<void> => {
  const user = req.appUser!;
  const conditions = [lte(productsTable.quantity, productsTable.reorderLevel)];

  if (!user.isAdmin) {
    conditions.push(eq(productsTable.ownerUserId, user.userId));
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(and(...conditions))
    .orderBy(productsTable.quantity, productsTable.name);

  res.json(ListLowStockProductsResponse.parse(products.map(serializeProduct)));
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const user = req.appUser!;
  const data = parsed.data;

  try {
    const [product] = await db
      .insert(productsTable)
      .values({
        ...data,
        ownerUserId: user.userId,
        sku: data.sku.trim(),
        name: data.name.trim(),
        category: data.category.trim(),
        unitPrice: data.unitPrice,
        costPrice: data.costPrice ?? 0,
        description: data.description?.trim() || null,
        supplier: data.supplier?.trim() || null,
      })
      .returning();

    res
      .status(201)
      .json(CreateProductResponse.parse(serializeProduct(product)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "That SKU is already in use in your inventory." });
      return;
    }
    throw error;
  }
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const params = GetProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.appUser!;
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  // Check ownership
  if (!user.isAdmin && product.ownerUserId !== user.userId) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  res.json(GetProductResponse.parse(serializeProduct(product)));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  const parsed = UpdateProductBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : !parsed.success
          ? parsed.error.message
          : "Invalid product update.",
    });
    return;
  }

  const user = req.appUser!;
  const [existing] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  if (!user.isAdmin && existing.ownerUserId !== user.userId) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "Add at least one field to update." });
    return;
  }

  const normalized = {
    ...updates,
    ...(updates.sku !== undefined ? { sku: updates.sku.trim() } : {}),
    ...(updates.name !== undefined ? { name: updates.name.trim() } : {}),
    ...(updates.category !== undefined
      ? { category: updates.category.trim() }
      : {}),
    ...(updates.costPrice !== undefined ? { costPrice: updates.costPrice } : {}),
    ...(updates.unitPrice !== undefined ? { unitPrice: updates.unitPrice } : {}),
    ...(updates.quantity !== undefined ? { quantity: updates.quantity } : {}),
    ...(updates.reorderLevel !== undefined ? { reorderLevel: updates.reorderLevel } : {}),
    ...(updates.description !== undefined
      ? { description: updates.description?.trim() || null }
      : {}),
    ...(updates.supplier !== undefined
      ? { supplier: updates.supplier?.trim() || null }
      : {}),
    updatedAt: new Date(),
  };

  try {
    const [product] = await db
      .update(productsTable)
      .set(normalized)
      .where(eq(productsTable.id, params.data.id))
      .returning();

    res.json(UpdateProductResponse.parse(serializeProduct(product)));
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "That SKU is already in use in your inventory." });
      return;
    }
    throw error;
  }
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const params = DeleteProductParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.appUser!;
  const [existing] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  if (!user.isAdmin && existing.ownerUserId !== user.userId) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  await db.delete(productsTable).where(eq(productsTable.id, params.data.id));

  res.sendStatus(204);
});

router.post("/products/:id/stock", async (req, res): Promise<void> => {
  const params = AdjustProductStockParams.safeParse(req.params);
  const parsed = AdjustProductStockBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : !parsed.success
          ? parsed.error.message
          : "Invalid stock adjustment.",
    });
    return;
  }
  if (parsed.data.delta === 0) {
    res.status(400).json({ error: "Stock adjustment cannot be zero." });
    return;
  }

  const user = req.appUser!;
  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id))
      .for("update")
      .limit(1);

    if (!current) return { kind: "not-found" as const };
    if (!user.isAdmin && current.ownerUserId !== user.userId) {
      return { kind: "not-found" as const };
    }

    const quantity = current.quantity + parsed.data.delta;
    if (quantity < 0) return { kind: "negative-stock" as const };

    const [updated] = await tx
      .update(productsTable)
      .set({ quantity, updatedAt: new Date() })
      .where(eq(productsTable.id, current.id))
      .returning();

    const [movement] = await tx
      .insert(stockMovementsTable)
      .values({
        productId: current.id,
        delta: parsed.data.delta,
        note: parsed.data.note?.trim() ?? "",
        userId: user.userId,
      })
      .returning();

    return {
      kind: "success" as const,
      product: serializeProduct(updated),
      movement: {
        ...movement,
        productName: current.name,
        productSku: current.sku,
        createdAt: movement.createdAt.toISOString(),
      },
    };
  });

  if (result.kind === "not-found") {
    res.status(404).json({ error: "Product not found." });
    return;
  }
  if (result.kind === "negative-stock") {
    res.status(400).json({ error: "Stock cannot be reduced below zero." });
    return;
  }

  res.json(AdjustProductStockResponse.parse(result));
});

router.get("/products/:id/movements", async (req, res): Promise<void> => {
  const params = ListProductMovementsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const user = req.appUser!;
  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, params.data.id))
    .limit(1);

  if (!product) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  if (!user.isAdmin && product.ownerUserId !== user.userId) {
    res.status(404).json({ error: "Product not found." });
    return;
  }

  const movements = await db
    .select({
      id: stockMovementsTable.id,
      productId: stockMovementsTable.productId,
      delta: stockMovementsTable.delta,
      note: stockMovementsTable.note,
      userId: stockMovementsTable.userId,
      createdAt: stockMovementsTable.createdAt,
    })
    .from(stockMovementsTable)
    .where(eq(stockMovementsTable.productId, product.id))
    .orderBy(desc(stockMovementsTable.createdAt), desc(stockMovementsTable.id));

  res.json(
    ListProductMovementsResponse.parse(
      movements.map((m) => ({
        ...m,
        productName: product.name,
        productSku: product.sku,
        createdAt: m.createdAt.toISOString(),
      })),
    ),
  );
});

router.get("/movements", async (req, res): Promise<void> => {
  const query = ListRecentMovementsQueryParams.safeParse(req.query);
  const limit = query.success && query.data.limit ? query.data.limit : 25;
  const user = req.appUser!;

  const conditions = [];
  if (!user.isAdmin) {
    conditions.push(eq(productsTable.ownerUserId, user.userId));
  }

  const rows = await db
    .select({
      id: stockMovementsTable.id,
      productId: stockMovementsTable.productId,
      delta: stockMovementsTable.delta,
      note: stockMovementsTable.note,
      userId: stockMovementsTable.userId,
      createdAt: stockMovementsTable.createdAt,
      productName: productsTable.name,
      productSku: productsTable.sku,
    })
    .from(stockMovementsTable)
    .innerJoin(productsTable, eq(stockMovementsTable.productId, productsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(stockMovementsTable.createdAt), desc(stockMovementsTable.id))
    .limit(limit);

  res.json(
    ListRecentMovementsResponse.parse(
      rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        productName: r.productName,
        productSku: r.productSku,
        delta: r.delta,
        note: r.note,
        userId: r.userId,
        createdAt: r.createdAt.toISOString(),
      })),
    ),
  );
});

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const user = req.appUser!;
  const conditions = [];

  if (!user.isAdmin) {
    conditions.push(eq(productsTable.ownerUserId, user.userId));
  }

  const [row] = await db
    .select({
      productCount: sql<number>`count(*)::int`,
      totalUnits: sql<number>`coalesce(sum(${productsTable.quantity}), 0)::int`,
      inventoryValue: sql<number>`coalesce(sum(${productsTable.quantity} * ${productsTable.unitPrice}), 0)::float8`,
      totalCostValue: sql<number>`coalesce(sum(${productsTable.quantity} * ${productsTable.costPrice}), 0)::float8`,
      lowStockCount: sql<number>`count(*) filter (where ${productsTable.quantity} > 0 and ${productsTable.quantity} <= ${productsTable.reorderLevel})::int`,
      outOfStockCount: sql<number>`count(*) filter (where ${productsTable.quantity} = 0)::int`,
      categoryCount: sql<number>`count(distinct ${productsTable.category})::int`,
    })
    .from(productsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(
    GetDashboardSummaryResponse.parse({
      productCount: Number(row.productCount),
      totalUnits: Number(row.totalUnits),
      inventoryValue: Number(row.inventoryValue),
      totalCostValue: Number(row.totalCostValue),
      lowStockCount: Number(row.lowStockCount),
      outOfStockCount: Number(row.outOfStockCount),
      categoryCount: Number(row.categoryCount),
    }),
  );
});

function csvCell(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

router.get("/reports/inventory.csv", async (req, res): Promise<void> => {
  const user = req.appUser!;
  const conditions = [];

  if (!user.isAdmin) {
    conditions.push(eq(productsTable.ownerUserId, user.userId));
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(productsTable.category, productsTable.name);

  const columns: Array<keyof (typeof products)[number] | "inventoryValue" | "totalCost"> = [
    "sku",
    "name",
    "category",
    "quantity",
    "reorderLevel",
    "costPrice",
    "unitPrice",
    "inventoryValue",
    "totalCost",
    "supplier",
    "description",
    "createdAt",
    "updatedAt",
  ];

  const rows = products.map((product) => ({
    ...product,
    costPrice: Number(product.costPrice).toFixed(2),
    unitPrice: Number(product.unitPrice).toFixed(2),
    inventoryValue: (product.quantity * Number(product.unitPrice)).toFixed(2),
    totalCost: (product.quantity * Number(product.costPrice)).toFixed(2),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  }));

  const csv = [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(",")),
  ].join("\r\n");

  res
    .type("text/csv")
    .setHeader(
      "Content-Disposition",
      `attachment; filename="inventory-report-${new Date().toISOString().slice(0, 10)}.csv"`,
    )
    .send(csv);
});

export default router;
