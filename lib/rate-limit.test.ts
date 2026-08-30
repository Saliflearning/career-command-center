import {
  hit,
  clientIp,
  __resetRateLimits,
  __trackedKeyCount,
  __MAX_TRACKED_KEYS,
} from "./rate-limit";

describe("rate limiter (QUALITY_AUDIT F2)", () => {
  beforeEach(() => __resetRateLimits());

  it("allows requests up to the limit and blocks the next one", () => {
    const key = "register:1.2.3.4";
    for (let i = 0; i < 5; i++) {
      expect(hit(key, 5, 60_000).allowed).toBe(true);
    }
    const blocked = hit(key, 5, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each key independently", () => {
    expect(hit("a", 1, 60_000).allowed).toBe(true);
    expect(hit("a", 1, 60_000).allowed).toBe(false);
    // A different caller is unaffected by the first one's budget.
    expect(hit("b", 1, 60_000).allowed).toBe(true);
  });

  it("resets after the window elapses", async () => {
    const key = "w";
    // A window wide enough that the two synchronous calls are certainly inside
    // it (a 1ms window could elapse between them and flake), but short enough
    // to wait out in the test.
    const windowMs = 50;
    expect(hit(key, 1, windowMs).allowed).toBe(true);
    expect(hit(key, 1, windowMs).allowed).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, windowMs + 30));
    expect(hit(key, 1, windowMs).allowed).toBe(true);
  });

  it("reports remaining budget", () => {
    expect(hit("r", 3, 60_000).remaining).toBe(2);
    expect(hit("r", 3, 60_000).remaining).toBe(1);
    expect(hit("r", 3, 60_000).remaining).toBe(0);
  });
});

describe("clientIp", () => {
  it("takes the first entry of x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
    expect(clientIp(h)).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip, then a shared bucket", () => {
    expect(clientIp(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    // No headers => shared bucket rather than an unlimited private one.
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("memory bound (Codex review finding)", () => {
  beforeEach(() => __resetRateLimits());

  it("stays bounded even when every tracked key is still live", () => {
    // A long window means nothing expires; only real eviction can bound this.
    const overflow = 500;
    for (let i = 0; i < __MAX_TRACKED_KEYS + overflow; i++) {
      hit(`ip-${i}`, 5, 60 * 60 * 1000);
    }
    expect(__trackedKeyCount()).toBeLessThanOrEqual(__MAX_TRACKED_KEYS);
  });
});
