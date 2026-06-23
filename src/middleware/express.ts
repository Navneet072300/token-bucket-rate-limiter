import type { Request, Response, NextFunction, RequestHandler } from "express";
import { TokenBucket, type ConsumeResult } from "../token-bucket.js";

export interface RateLimiterOptions {
  capacity: number;
  refillRate: number;
  keyBy?: (req: Request) => string;
  onRejected?: (req: Request, res: Response, result: ConsumeResult) => void;
}

function defaultOnRejected(_req: Request, res: Response, result: ConsumeResult): void {
  res.status(429);
  if (result.retryAfter !== undefined) {
    res.setHeader("Retry-After", Math.ceil(result.retryAfter).toString());
  }
  res.json({
    error: "Too Many Requests",
    retryAfter: result.retryAfter !== undefined ? Math.ceil(result.retryAfter) : undefined,
  });
}

export function rateLimiter(options: RateLimiterOptions): RequestHandler {
  const buckets = new Map<string, TokenBucket>();
  const keyBy = options.keyBy ?? ((req: Request) => req.ip ?? "unknown");
  const onRejected = options.onRejected ?? defaultOnRejected;

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyBy(req);

    let bucket = buckets.get(key);
    if (bucket === undefined) {
      bucket = new TokenBucket({
        capacity: options.capacity,
        refillRate: options.refillRate,
      });
      buckets.set(key, bucket);
    }

    const result = bucket.tryConsume(1);

    res.setHeader("X-RateLimit-Limit", options.capacity.toString());
    res.setHeader("X-RateLimit-Remaining", Math.floor(result.remaining).toString());

    if (result.allowed) {
      next();
    } else {
      onRejected(req, res, result);
    }
  };
}
