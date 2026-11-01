# STOCKROOM ACCESS — Inventory Management System for Small Businesses

A modern, full-stack inventory management web application built for small businesses to track products, manage stock levels, monitor purchases and sales, handle replenishment alerts, and manage team permissions.

---

## 🌟 Key Features

### 📦 Product & Catalog Management
- **Complete Product Catalog**: Manage products with SKU, Name, Category, Supplier, Description, and Stock quantities.
- **Dual-Price Tracking**: Track both **Purchase Price (Cost)** and **Selling Price (Retail)** to calculate actual inventory valuation and profit margins.
- **Fast Search & Instant Filtering**: Search in real-time across Product Name, SKU, Category, and Supplier. Filter by Category and Stock Status (*All*, *Low stock*, *Out of stock*).
- **Per-Owner Unique SKU**: Each business or account manages its own private catalog without SKU collisions.

### 📈 Stock Control & Movement History
- **Stock-In & Stock-Out Tracking**: Record inventory adjustments with delta quantities (`+10` for restock, `-3` for sales or damage) and custom reason notes.
- **Stock Movement Audit Log**: View historical stock movements directly in the product detail modal with timestamps, adjustor details, and notes.
- **Replenishment Watch**: Automatic alerts when product stock reaches or drops below minimum reorder thresholds.
- **Out of Stock Warnings**: Prominently highlights depleted products needing immediate attention.

### 🔐 Multi-Tier Authentication & Access Control
- **Clerk Authentication**: Secure sign-up, sign-in, session management, and passwordless authentication.
- **Normal User Role**:
  - Secure private inventory: Users see, manage, and edit **only their own products**.
  - All operations verified on the backend by session identity.
  - Personal dashboard summaries and exportable reports.
- **Administrator Role**:
  - Global overview across the system.
  - **Team & User Management**: View all registered accounts, join dates, and products owned.
  - Role management: Promote users to Administrator or assign Normal User roles.
  - Automated initial administrator bootstrap via approved environment email (`ADMIN_EMAIL`).

### 📊 Real-Time Analytics & CSV Reports
- **Executive Dashboard**: Live metrics for Total Products, Total Units on Hand, Retail Inventory Value, and Total Purchase Cost Value.
- **Replenishment Breakdown**: Visual breakdown of in-stock, low-stock, and out-of-stock items.
- **One-Click CSV Export**: Download complete inventory snapshots conforming to standard RFC CSV formatting for spreadsheet analysis.

### 📱 Responsive Modern Design
- Clean, responsive user interface styled with Tailwind CSS, Radix UI components, and Lucide icons.
- Optimized for desktops, tablets, and mobile devices.

---

## 🛠️ Technology Stack

- **Frontend**: React 19, Vite 7, Tailwind CSS, Radix UI, Wouter, TanStack Query v5, Lucide Icons
- **Backend**: Node.js 22 LTS, Express 5, TypeScript 5.9, Pino HTTP Logger
- **Database & ORM**: PostgreSQL, Drizzle ORM, Drizzle Kit
- **Authentication**: Clerk (`@clerk/react`, `@clerk/express`)
- **API Spec & Codegen**: OpenAPI 3.1, Orval, Zod
- **Monorepo / Package Manager**: pnpm workspaces

---

## 🚀 Getting Started (Visual Studio Code on Windows)

### Prerequisites

1. **Node.js**: Node.js 20 LTS or Node.js 22 LTS installed ([Download Node.js](https://nodejs.org/)).
2. **pnpm**: Enabled via corepack:
   ```powershell
   corepack enable
   corepack prepare pnpm@latest --activate
   ```
3. **PostgreSQL Database**:
   - Free cloud PostgreSQL database from [Neon](https://neon.tech), [Supabase](https://supabase.com), or [Railway](https://railway.app), **or** a local PostgreSQL instance running on port 5432.
4. **Clerk Account**:
   - Create a free application at [Clerk Dashboard](https://dashboard.clerk.com).
   - Enable Email/Password authentication.

---

### Step 1: Open the Project in VS Code

1. Launch Visual Studio Code.
2. Select **File** → **Open Folder...** and choose `Inventory-Control-Hub`.
3. Open an integrated PowerShell terminal in VS Code (`Ctrl + \``).

---

### Step 2: Install Dependencies

Run the following command in PowerShell:

```powershell
pnpm install
```

---

### Step 3: Configure Environment Variables

1. Copy the example configuration to `.env` in the project root:
   ```powershell
   Copy-Item .env.example .env
   ```

2. Open the `.env` file in VS Code and fill in your values:
   ```env
   # PostgreSQL Connection String (from Neon, Supabase, or local Postgres)
   DATABASE_URL=postgresql://USER:PASSWORD@ep-sample-123456.us-east-2.aws.neon.tech/neondb?sslmode=require

   # Clerk API Keys (from https://dashboard.clerk.com -> API Keys)
   CLERK_PUBLISHABLE_KEY=pk_test_YOUR_CLERK_PUBLISHABLE_KEY
   CLERK_SECRET_KEY=sk_test_YOUR_CLERK_SECRET_KEY

   # Initial Administrator Email
   # When a user registers with this email address, they will automatically be granted Administrator access
   ADMIN_EMAIL=admin@yourbusiness.com

   # API Server Port
   PORT=3001
   ```

3. Create the frontend `.env` file:
   ```powershell
   Copy-Item artifacts\inventory-manager\.env.example artifacts\inventory-manager\.env
   ```

4. Open `artifacts\inventory-manager\.env` and set `VITE_CLERK_PUBLISHABLE_KEY`:
   ```env
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_CLERK_PUBLISHABLE_KEY
   VITE_API_URL=http://localhost:3001
   PORT=5173
   BASE_PATH=/
   ```

---

### Step 4: Synchronize Database Schema

Push the Drizzle ORM schema to your PostgreSQL database:

```powershell
pnpm run db:push
```

This creates the following tables:
- `inventory_products` (with owner isolation and cost price)
- `inventory_admin_users` (admin list and bootstrap)
- `inventory_user_profiles` (user accounts, roles, and profiles)
- `inventory_stock_movements` (stock-in / stock-out transaction logs)

---

### Step 5: Start Frontend and Backend

You can run both servers with a single command from the project root:

```powershell
pnpm run dev
```

*This starts both the API server on `http://localhost:3001` and the Vite frontend on `http://localhost:5173` simultaneously.*

Alternatively, you can run them in separate terminals:

#### Terminal 1 — Start the API Server:
```powershell
pnpm run dev:api
```
*API server will listen on `http://localhost:3001`.*

#### Terminal 2 — Start the Frontend:
```powershell
pnpm run dev:frontend
```
*Frontend will launch on `http://localhost:5173`.*

Or press **Ctrl + Shift + B** in VS Code to run the pre-configured compound task **"Start Stockroom (API + Frontend)"**.

---

### Step 6: Open the Application

Open your browser and navigate to:
```
http://localhost:5173
```

1. Click **Create account** to sign up.
2. If your email matches `ADMIN_EMAIL`, you will automatically be granted **Administrator** access.
3. Other users who register receive **Normal User** access with their own private inventory.
4. Administrators can promote other users to Admin from the **Team & Users** page (`/users`).

---

## 📁 Repository Structure

```
Inventory-Control-Hub/
├── .vscode/                     # VS Code tasks and debug configurations
├── artifacts/
│   ├── api-server/              # Express 5 REST API & backend application
│   │   ├── src/
│   │   │   ├── middlewares/     # Clerk auth, permission & proxy middlewares
│   │   │   ├── routes/          # Inventory, Admin, Health, Auth routes
│   │   │   ├── app.ts           # Express application setup
│   │   │   └── index.ts         # Server startup & port binding
│   │   ├── test/                # Multi-tenant API integration tests
│   │   └── build.mjs            # esbuild production bundler
│   └── inventory-manager/       # React 19 + Vite frontend
│       ├── src/
│       │   ├── components/      # Radix UI & custom components
│       │   ├── App.tsx          # Main application, routes, modals, views
│       │   └── app.css          # Stockroom theme styling
│       └── vite.config.ts       # Vite build & development proxy setup
├── lib/
│   ├── api-client-react/        # Generated TanStack React Query hooks
│   ├── api-spec/                # OpenAPI 3.1 specification & Orval config
│   ├── api-zod/                 # Generated Zod validation schemas
│   └── db/                      # PostgreSQL Drizzle ORM schema & client
├── package.json                 # Monorepo root scripts
├── pnpm-workspace.yaml          # Monorepo package declarations & dependencies
└── README.md                    # Project documentation
```

---

## 🧪 Testing

To run the full suite of integration tests:

```powershell
pnpm run test:api
```

To run TypeScript verification across all packages:

```powershell
pnpm run typecheck
```

To build production bundles:

```powershell
pnpm run build
```

---

## 🌐 Production Deployment

### Recommended Deployment Setup:
- **Database**: [Neon Serverless Postgres](https://neon.tech) or [Supabase](https://supabase.com).
- **Backend API**: [Render](https://render.com), [Railway](https://railway.app), or [Fly.io](https://fly.io).
- **Frontend**: [Vercel](https://vercel.com), [Netlify](https://netlify.com), or [Cloudflare Pages](https://pages.cloudflare.com).

### Production Environment Variables:

**Backend (API Server)**:
- `DATABASE_URL`: Production PostgreSQL connection string (with SSL enabled).
- `CLERK_PUBLISHABLE_KEY`: Clerk production publishable key (`pk_live_...`).
- `CLERK_SECRET_KEY`: Clerk production secret key (`sk_live_...`).
- `ADMIN_EMAIL`: Initial administrator email address.
- `NODE_ENV`: `production`
- `PORT`: Server port (e.g. `3001` or provided by host).

**Frontend**:
- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk production publishable key.
- `VITE_API_URL`: Public URL of your deployed API server (e.g., `https://api.yourdomain.com`).
- `BASE_PATH`: `/`

---

## 🔒 Security Best Practices

- `.env` and `.env.*` files are excluded in `.gitignore` and must **never** be committed to version control.
- All product and stock operations enforce user authorization on the backend.
- Database queries are parameterized by Drizzle ORM to protect against SQL injection.
- Secret keys (`CLERK_SECRET_KEY`, `DATABASE_URL`) are strictly restricted to the backend server.

---

## 📄 License

This project is licensed under the MIT License.
