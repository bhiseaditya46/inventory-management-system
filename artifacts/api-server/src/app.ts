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

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files first
const clientDistPath = path.resolve(
  import.meta.dirname,
  "../../artifacts/inventory-manager/dist/public",
);

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
}

// Setup Clerk authentication middleware on API routes if secret key is present
const hasSecretKey = Boolean(
  process.env.CLERK_SECRET_KEY &&
    !process.env.CLERK_SECRET_KEY.includes("REPLACE_ME") &&
    process.env.CLERK_SECRET_KEY.startsWith("sk_"),
);

if (hasSecretKey) {
  try {
    app.use(
      "/api",
      clerkMiddleware({
        publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
        secretKey: process.env.CLERK_SECRET_KEY,
        jwtKey: process.env.CLERK_JWT_KEY,
      }),
    );
  } catch (err) {
    logger.warn({ err }, "Could not initialize clerkMiddleware, using fallback");
  }
}

// Mount API routes
app.use("/api", router);

// Serve index.html for frontend client routing or redirect in dev
if (fs.existsSync(clientDistPath)) {
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api") && req.accepts("html")) {
      res.sendFile(path.join(clientDistPath, "index.html"));
    } else {
      next();
    }
  });
} else {
  // In development, redirect root requests to the Vite dev server
  app.get("/", (_req, res) => {
    const frontendPort = process.env.FRONTEND_PORT || "5173";
    res.redirect(`http://localhost:${frontendPort}/`);
  });
}

export default app;
