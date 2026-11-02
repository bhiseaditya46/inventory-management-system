import "./env";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(
  cors({
    origin: (_origin, callback) => {
      // Reflect origin so browsers accept credentials in cross-origin setups
      callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "X-Requested-With"],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Locate static frontend build across possible deployment layouts
const candidateDistPaths = [
  process.env.CLIENT_DIST_PATH,
  path.resolve(process.cwd(), "artifacts/inventory-manager/dist/public"),
  path.resolve(import.meta.dirname, "../../inventory-manager/dist/public"),
  path.resolve(import.meta.dirname, "../../../artifacts/inventory-manager/dist/public"),
  path.resolve(import.meta.dirname, "public"),
  path.resolve(process.cwd(), "dist/public"),
].filter(Boolean) as string[];

const clientDistPath = candidateDistPaths.find((p) => fs.existsSync(p)) || candidateDistPaths[0];
const hasClientDist = fs.existsSync(clientDistPath);

if (hasClientDist) {
  logger.info({ clientDistPath }, "Serving static frontend assets");
  app.use(express.static(clientDistPath));
}

// Setup Clerk authentication middleware on API routes if keys are present
const hasSecretKey = Boolean(
  process.env.CLERK_SECRET_KEY &&
    !process.env.CLERK_SECRET_KEY.includes("REPLACE_ME") &&
    process.env.CLERK_SECRET_KEY.startsWith("sk_"),
);

const hasPublishableKey = Boolean(
  process.env.CLERK_PUBLISHABLE_KEY &&
    !process.env.CLERK_PUBLISHABLE_KEY.includes("REPLACE_ME") &&
    process.env.CLERK_PUBLISHABLE_KEY.startsWith("pk_"),
);

if (hasSecretKey || hasPublishableKey) {
  try {
    app.use(
      "/api",
      clerkMiddleware({
        publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
        ...(hasSecretKey ? { secretKey: process.env.CLERK_SECRET_KEY } : {}),
        ...(process.env.CLERK_JWT_KEY ? { jwtKey: process.env.CLERK_JWT_KEY } : {}),
      }),
    );
  } catch (err) {
    logger.warn({ err }, "Could not initialize clerkMiddleware, using fallback");
  }
}

// Mount API routes
app.use("/api", router);

// Serve index.html for frontend client routing (SPA) or redirect in dev
if (hasClientDist) {
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && req.accepts("html")) {
      res.sendFile(path.join(clientDistPath, "index.html"));
    } else {
      next();
    }
  });
} else if (process.env.NODE_ENV !== "production") {
  // In development, redirect root requests to the Vite dev server
  app.get("/", (_req, res) => {
    const frontendPort = process.env.FRONTEND_PORT || "5173";
    res.redirect(`http://localhost:${frontendPort}/`);
  });
}

export default app;
