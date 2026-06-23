import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { TokenBucket } from "./token-bucket.js";

// Freeze Date.now so refill arithmetic is deterministic
let mockedNow = 0;
const realDateNow = Date.now;

before(() => {
  mockedNow = realDateNow();
  Date.now = () => mockedNow;
});

after(() => {
  Date.now = realDateNow;
});

function advanceMs(ms: number): void {
  mockedNow += ms;
}

describe("TokenBucket", () => {
  describe("consume()", () => {
    it("returns true when tokens are available", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
      assert.equal(bucket.consume(1), true);
    });

    it("deducts tokens on each successful consume", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
      bucket.consume(3);
      const state = bucket.getState();
      assert.equal(state.tokens, 7);
    });

    it("returns false when bucket is empty", () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
      for (let i = 0; i < 5; i++) bucket.consume(1);
      assert.equal(bucket.consume(1), false);
    });

    it("returns false when requesting more tokens than capacity", () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
      assert.equal(bucket.consume(6), false);
    });

    it("defaults to consuming 1 token when called with no argument", () => {
      const bucket = new TokenBucket({ capacity: 3, refillRate: 1 });
      bucket.consume();
      assert.equal(bucket.getState().tokens, 2);
    });
  });

  describe("refill logic", () => {
    it("refills tokens proportionally to elapsed time", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 2, initialTokens: 0 });
      advanceMs(3000); // 3 seconds × 2 tokens/s = 6 tokens
      assert.equal(bucket.consume(6), true);
    });

    it("does not exceed capacity when refilling", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 5, initialTokens: 8 });
      advanceMs(10_000); // would add 50, but must cap at capacity
      const state = bucket.getState();
      assert.equal(state.tokens, 10);
    });

    it("partial-second refill accumulates fractional tokens", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 2, initialTokens: 0 });
      advanceMs(500); // 0.5 s × 2 = 1 token
      assert.equal(bucket.consume(1), true);
      assert.equal(bucket.consume(1), false);
    });
  });

  describe("tryConsume()", () => {
    it("returns allowed=true and correct remaining on success", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
      const result = bucket.tryConsume(3);
      assert.equal(result.allowed, true);
      assert.equal(result.remaining, 7);
      assert.equal(result.retryAfter, undefined);
    });

    it("returns allowed=false with retryAfter when rejected", () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 2, initialTokens: 1 });
      // 1 token available, need 3 → deficit 2, refillRate 2 → retryAfter 1s
      const result = bucket.tryConsume(3);
      assert.equal(result.allowed, false);
      assert.equal(result.remaining, 1);
      assert.ok(result.retryAfter !== undefined, "retryAfter should be defined");
      assert.equal(result.retryAfter, 1);
    });

    it("retryAfter scales with deficit and refill rate", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1, initialTokens: 0 });
      // deficit = 5, refillRate = 1 → retryAfter = 5
      const result = bucket.tryConsume(5);
      assert.equal(result.allowed, false);
      assert.equal(result.retryAfter, 5);
    });

    it("does not allow a request exceeding capacity", () => {
      const bucket = new TokenBucket({ capacity: 5, refillRate: 1 });
      const result = bucket.tryConsume(10);
      assert.equal(result.allowed, false);
    });
  });

  describe("refill()", () => {
    it("fully refills bucket when called with no argument", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1, initialTokens: 2 });
      bucket.refill();
      assert.equal(bucket.getState().tokens, 10);
    });

    it("adds specified tokens without exceeding capacity", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1, initialTokens: 8 });
      bucket.refill(5);
      assert.equal(bucket.getState().tokens, 10);
    });

    it("throws on negative token argument", () => {
      const bucket = new TokenBucket({ capacity: 10, refillRate: 1 });
      assert.throws(() => bucket.refill(-1), RangeError);
    });
  });

  describe("constructor validation", () => {
    it("throws on capacity <= 0", () => {
      assert.throws(() => new TokenBucket({ capacity: 0, refillRate: 1 }), RangeError);
    });

    it("throws on refillRate <= 0", () => {
      assert.throws(() => new TokenBucket({ capacity: 10, refillRate: 0 }), RangeError);
    });

    it("uses capacity as default initialTokens", () => {
      const bucket = new TokenBucket({ capacity: 7, refillRate: 1 });
      assert.equal(bucket.getState().tokens, 7);
    });
  });
});
