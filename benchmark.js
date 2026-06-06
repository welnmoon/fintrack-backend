const http = require("http");

const BASE = process.env.BACKEND_URL || "http://localhost:3000";
const EMAIL = process.env.EMAIL;
const PASSWORD = process.env.PASSWORD;

let cookies = "";

async function request(path, label) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request(
      `${BASE}${path}`,
      {
        headers: { Cookie: cookies },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          const ms = Date.now() - start;
          console.log(
            `${label.padEnd(30)} ${String(ms).padStart(6)} ms   HTTP ${res.statusCode}`,
          );
          resolve(ms);
        });
      },
    );
    req.end();
  });
}

async function login() {
  return new Promise((resolve) => {
    const body = JSON.stringify({ email: EMAIL, password: PASSWORD });
    const req = http.request(
      `${BASE}/auth/login`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
        },
      },
      (res) => {
        cookies = (res.headers["set-cookie"] || [])
          .map((c) => c.split(";")[0])
          .join("; ");
        res.resume();
        res.on("end", () => {
          console.log("Logged in ✓\n");
          resolve();
        });
      },
    );
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.log("Usage: EMAIL=... PASSWORD=... node scripts/benchmark.js");
    process.exit(1);
  }

  await login();

  const FOREX = "/forex/snapshot?symbol=EUR/USD&interval=1min";

  console.log("=== Run 1 (первый запрос — cold) ===");
  await request(FOREX, "forex:cold");
  await request(FOREX, "forex:warm");
  await request("/dashboard", "dashboard");
  await request(
    "/dashboard/balance-history?interval=day&points=30",
    "balance-history",
  );
  await request("/dashboard/expense-pie?limit=10", "expense-pie");
  await request("/dashboard/forecast", "forecast");

  console.log("\n=== Run 2 (всё из кэша) ===");
  await request(FOREX, "forex:cached");
  await request("/dashboard", "dashboard:2");
  await request(
    "/dashboard/balance-history?interval=day&points=30",
    "balance-history:2",
  );
  await request("/dashboard/expense-pie?limit=10", "expense-pie:2");
  await request("/dashboard/forecast", "forecast:2");
}

main();
