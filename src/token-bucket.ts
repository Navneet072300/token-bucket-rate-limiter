export interface TokenBucketOptions {
  capacity: number;
  refillRate: number;
  initialTokens?: number;
}

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

export interface BucketState {
  tokens: number;
  capacity: number;
  refillRate: number;
}

export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRate: number;
  private lastRefillTime: number;

  constructor(options: TokenBucketOptions) {
    if (options.capacity <= 0) throw new RangeError("capacity must be > 0");
    if (options.refillRate <= 0) throw new RangeError("refillRate must be > 0");

    this.capacity = options.capacity;
    this.refillRate = options.refillRate;
    this.tokens = options.initialTokens ?? options.capacity;
    this.lastRefillTime = Date.now();
  }

  private applyRefill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefillTime) / 1000;
    const earned = elapsed * this.refillRate;
    this.tokens = Math.min(this.tokens + earned, this.capacity);
    this.lastRefillTime = now;
  }

  consume(tokens: number = 1): boolean {
    this.applyRefill();

    if (tokens > this.capacity) return false;

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return true;
    }

    return false;
  }

  tryConsume(tokens: number = 1): ConsumeResult {
    this.applyRefill();

    if (tokens > this.capacity) {
      return { allowed: false, remaining: this.tokens };
    }

    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      return { allowed: true, remaining: this.tokens };
    }

    const deficit = tokens - this.tokens;
    const retryAfter = deficit / this.refillRate;

    return {
      allowed: false,
      remaining: this.tokens,
      retryAfter,
    };
  }

  refill(tokens?: number): void {
    if (tokens === undefined) {
      this.tokens = this.capacity;
      this.lastRefillTime = Date.now();
    } else {
      if (tokens < 0) throw new RangeError("refill tokens must be >= 0");
      this.tokens = Math.min(this.tokens + tokens, this.capacity);
    }
  }

  getState(): BucketState {
    this.applyRefill();
    return {
      tokens: this.tokens,
      capacity: this.capacity,
      refillRate: this.refillRate,
    };
  }
}
