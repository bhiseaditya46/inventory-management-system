# Stockroom Access — Visual Studio Code setup

## Important status

This package is the original Replit project with VS Code workspace conveniences and environment templates. **The private-inventory ownership migration and authorization changes have NOT been applied yet.** Do not deploy this as a multi-user private-inventory system until those changes are implemented and tested. The current API still applies `requireAdmin` to inventory routes and the current products schema has no owner column.

## Requirements

- Windows 10/11 (or macOS/Linux)
- Node.js 20 LTS or newer
- pnpm (enable with `corepack enable`, then `corepack prepare pnpm@latest --activate`)
- Visual Studio Code
- PostgreSQL database
- Clerk application with sign-in and sign-up enabled

## Open the project

1. Extract the ZIP to a folder such as `C:\Projects\StockroomAccess`.
2. Open VS Code → File → Open Folder → select `Inventory-Control-Hub`.
3. Open Terminal → New Terminal in the project root.
4. Run `corepack enable` if pnpm is not available, then `pnpm install`.

## Configure secrets

1. Copy the root `.env.example` to `.env`.
2. Fill in `DATABASE_URL`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `ADMIN_EMAIL`, and `PORT=3001`.
3. Copy `artifacts/inventory-manager/.env.example` to `artifacts/inventory-manager/.env`.
4. Set `VITE_CLERK_PUBLISHABLE_KEY` to the same Clerk publishable key and keep `BASE_PATH=/` and `PORT=5173`.
5. Never commit `.env` files or share Clerk secret keys/database passwords.

## Database

The database package has a Drizzle `push` script. Once `DATABASE_URL` is configured, run:

```powershell
pnpm --filter @workspace/db push
```

This syncs the schema currently in the project. It does not add per-user product ownership in this version.

## Run locally

Open two VS Code terminals.

Terminal 1 — API server:

```powershell
cd artifacts/api-server
$env:NODE_ENV='development'; $env:PORT='3001'; pnpm run build; pnpm run start
```

Terminal 2 — frontend:

```powershell
cd artifacts/inventory-manager
$env:PORT='5173'; $env:BASE_PATH='/'; pnpm run dev
```

Open `http://localhost:5173`.

If the frontend cannot reach the API, check the Vite proxy configuration and ensure the API is listening on port 3001. Do not expose the API publicly until CORS, Clerk origins, and authorization are configured for your deployment.

## Private inventory work still required

Before private inventory is ready, implement and test all of the following as one coordinated change:

- Add a non-null Clerk `owner_user_id` column to products.
- Backfill existing product rows to the verified administrator's Clerk user ID before enforcing `NOT NULL`.
- Replace the global SKU unique index with a per-owner unique index.
- Require a valid Clerk session on inventory endpoints; administrators may have cross-owner access.
- Scope list, detail, update, delete, stock movement, low-stock, dashboard and CSV queries by owner (unless admin).
- Set owner from the verified session on create; never accept owner ID from request JSON.
- Ensure stock movement records can only be accessed through products owned by that user.
- Remove the frontend's admin-only gate for ordinary authenticated users while retaining admin-only controls.
- Add integration tests proving user A cannot read/change/delete user B's products.

Do not merely remove `requireAdmin`: that would expose the existing shared inventory to all signed-in users.
