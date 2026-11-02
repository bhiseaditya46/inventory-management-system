import { spawn } from "node:child_process";

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testServer() {
  console.log("Starting production server...");
  const proc = spawn("node", ["artifacts/api-server/dist/index.mjs"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  proc.stdout.on("data", (d) => process.stdout.write(`[SERVER] ${d}`));
  proc.stderr.on("data", (d) => process.stderr.write(`[SERVER ERR] ${d}`));

  // Give server time to bind port
  await sleep(3000);

  try {
    console.log("\nTesting GET /api/healthz...");
    const healthRes = await fetch("http://127.0.0.1:3001/api/healthz");
    console.log("Health status:", healthRes.status);
    const healthJson = await healthRes.json();
    console.log("Health body:", healthJson);

    console.log("\nTesting GET / (Static Frontend)...");
    const rootRes = await fetch("http://127.0.0.1:3001/");
    console.log("Root status:", rootRes.status);
    const rootHtml = await rootRes.text();
    console.log("Root content preview:", rootHtml.slice(0, 180));
    console.log("Has root div:", rootHtml.includes('<div id="root">'));

    console.log("\nTesting GET /dashboard (SPA Route)...");
    const dashRes = await fetch("http://127.0.0.1:3001/dashboard");
    console.log("Dashboard status:", dashRes.status);
    const dashHtml = await dashRes.text();
    console.log("Has root div on SPA route:", dashHtml.includes('<div id="root">'));

    console.log("\nTesting GET /api/inventory/products (Auth required)...");
    const authRes = await fetch("http://127.0.0.1:3001/api/inventory/products");
    console.log("Auth-protected route status (should be 401):", authRes.status);
    const authJson = await authRes.json();
    console.log("Auth response body:", authJson);

    console.log("\nAll server tests PASSED!");
  } finally {
    proc.kill("SIGTERM");
    console.log("Server terminated.");
  }
}

testServer().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
