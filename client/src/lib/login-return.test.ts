import { describe, expect, it } from "vitest";
import { loginReturnPath } from "./login-return";
describe("safe customer sign-in return", () => {
  it("returns the customer to a retained checkout or owned order route", () => {
    expect(loginReturnPath("?returnTo=%2Fcheckout")).toBe("/checkout");
    expect(loginReturnPath("?returnTo=%2Forders%2F42")).toBe("/orders/42");
  });
  it("rejects external, administrator and nested redirect destinations", () => {
    for (const path of [
      "https://evil.invalid",
      "//evil.invalid",
      "/admin",
      "/login",
      "/\\evil.invalid",
      "/orders/../admin",
    ])
      expect(loginReturnPath("?returnTo=" + encodeURIComponent(path))).toBe(
        "/account"
      );
  });
});
