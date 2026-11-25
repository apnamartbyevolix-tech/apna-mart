import { randomBytes, scryptSync } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isReviewDemo,
  reviewDemoConfig,
  withReviewDemo,
} from "./review-demo-context";
import {
  signReviewToken,
  validReviewToken,
  verifyReviewPassword,
} from "./review-demo";

const password = "fictional-test-password-only";
const salt = randomBytes(16);
const hash =
  "scrypt-v1:" +
  salt.toString("hex") +
  ":" +
  scryptSync(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString("hex");
const config = () => ({
  NODE_ENV: "test",
  MTM_REVIEW_DEMO_ENABLED: "1",
  DATABASE_URL: "postgresql://main:fake@127.0.0.1:5432/mtm_e2e_main_test",
  MTM_REVIEW_DATABASE_URL:
    "postgresql://review:fake@127.0.0.1:5432/mtm_e2e_review_test",
  MTM_REVIEW_USERNAME: "play-review",
  MTM_REVIEW_PASSWORD_HASH: hash,
  MTM_REVIEW_SESSION_SECRET: "x".repeat(43),
  MTM_AUTH_ORIGINS: "http://127.0.0.1:3000",
});
afterEach(() => vi.unstubAllEnvs());
describe("isolated reviewer access safety", () => {
  it("is off by default and exposes no credentials", () =>
    expect(reviewDemoConfig({})).toBeNull());
  it("rejects the live database even under another role", () =>
    expect(() =>
      reviewDemoConfig({
        ...config(),
        MTM_REVIEW_DATABASE_URL:
          "postgresql://review:fake@127.0.0.1/mtm_e2e_main_test",
      })
    ).toThrow(/separate database/));
  it("rejects reuse of the live role", () =>
    expect(() =>
      reviewDemoConfig({
        ...config(),
        MTM_REVIEW_DATABASE_URL:
          "postgresql://main:fake@127.0.0.1/mtm_e2e_review_test",
      })
    ).toThrow(/separate database/));
  it("rejects non-test local databases", () =>
    expect(() =>
      reviewDemoConfig({
        ...config(),
        MTM_REVIEW_DATABASE_URL:
          "postgresql://review:fake@127.0.0.1/mtm_review_demo",
      })
    ).toThrow(/disposable/));
  it("rejects connection options that can escape isolation", () =>
    expect(() =>
      reviewDemoConfig({
        ...config(),
        MTM_REVIEW_DATABASE_URL:
          "postgresql://review:fake@127.0.0.1/mtm_e2e_review_test?options=bad",
      })
    ).toThrow(/options/));
  it("rejects remote databases in local testing", () =>
    expect(() =>
      reviewDemoConfig({
        ...config(),
        MTM_REVIEW_DATABASE_URL:
          "postgresql://review:fake@example.invalid/mtm_review_demo",
      })
    ).toThrow(/Remote/));
  it("requires a secure explicit production origin", () =>
    expect(() =>
      reviewDemoConfig({
        ...config(),
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://main:fake@db.example.invalid/live",
        MTM_REVIEW_DATABASE_URL:
          "postgresql://review:fake@db.example.invalid/mtm_review_demo",
        MTM_AUTH_ORIGINS: "http://apna-mart.in",
      })
    ).toThrow(/secure/));
  it("accepts a distinct production review database without opening it", () =>
    expect(
      reviewDemoConfig({
        ...config(),
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://main:fake@db.example.invalid/live",
        MTM_REVIEW_DATABASE_URL:
          "postgresql://review:fake@db.example.invalid/mtm_review_demo",
        MTM_AUTH_ORIGINS: "https://apna-mart.in",
      })?.connection.ssl
    ).toEqual({ rejectUnauthorized: true }));
  it("rejects weak credentials and malformed password hashes", () =>
    expect(() =>
      reviewDemoConfig({ ...config(), MTM_REVIEW_PASSWORD_HASH: password })
    ).toThrow(/credentials/));
  it("authenticates the correct password, rejecting mismatches", async () => {
    expect(await verifyReviewPassword(password, hash)).toBe(true);
    expect(await verifyReviewPassword("wrong", hash)).toBe(false);
  });
  it("rejects forged, truncated and cross-key session cookies", () => {
    const secret = randomBytes(32).toString("base64url"),
      token = randomBytes(32).toString("base64url");
    const signed = signReviewToken(token, secret);
    expect(validReviewToken(signed, secret)).toBe(true);
    expect(validReviewToken(signed, "another-secret")).toBe(false);
    expect(validReviewToken(signed.slice(1), secret)).toBe(false);
    expect(validReviewToken(signed + "x", secret)).toBe(false);
  });
  it("never changes the normal database scope during simultaneous requests", async () => {
    expect(isReviewDemo()).toBe(false);
    const [demo, normal] = await Promise.all([
      withReviewDemo(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return isReviewDemo();
      }),
      (async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return isReviewDemo();
      })(),
    ]);
    expect(demo).toBe(true);
    expect(normal).toBe(false);
    expect(isReviewDemo()).toBe(false);
  });
});
