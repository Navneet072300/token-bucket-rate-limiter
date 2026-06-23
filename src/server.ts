import express from "express";
import { rateLimiter } from "./middleware/express.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

// Trust proxy so req.ip reflects the real client IP behind a load balancer
app.set("trust proxy", true);

app.get(
  "/api/data",
  rateLimiter({ capacity: 10, refillRate: 2 }),
  (_req, res) => {
    res.json({ message: "Here is your data", timestamp: new Date().toISOString() });
  },
);

app.get(
  "/api/premium",
  rateLimiter({ capacity: 50, refillRate: 10 }),
  (_req, res) => {
    res.json({ message: "Here is your premium data", timestamp: new Date().toISOString() });
  },
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log("Routes:");
  console.log("  GET /api/data    — 10 capacity, 2 req/s refill");
  console.log("  GET /api/premium — 50 capacity, 10 req/s refill");
  console.log("  GET /health      — unprotected");
});
