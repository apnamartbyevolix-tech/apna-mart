import { afterEach, describe, it, expect, vi } from "vitest";
import { sendCustomerOtp } from "./mobile-auth";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("customer APITXT SMS adapter", () => {
  it("uses the fixed HTTPS POST endpoint and keeps authentication/code out of the URL", async () => {
    vi.stubEnv("MTM_SMS_PROVIDER", "apitxt");
    vi.stubEnv("APITXT_AUTH_KEY", "fake-unit-test-provider-key");
    const send = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: "success",
            data: { request_id: "fake-provider-id" },
          })
        )
    );
    vi.stubGlobal("fetch", send);
    await sendCustomerOtp("+919000000001", "123456", "test");
    const [url, request] = (
      send.mock.calls as unknown as [string, RequestInit][]
    )[0];
    expect(url).toBe("https://apitxt.com/api/sendOTP");
    expect(request.method).toBe("POST");
    expect(request.redirect).toBe("error");
    expect(String(request.body)).toContain("channel=sms");
  });
  it("does not treat HTTP success alone as delivery acceptance", async () => {
    vi.stubEnv("MTM_SMS_PROVIDER", "apitxt");
    vi.stubEnv("APITXT_AUTH_KEY", "fake-unit-test-provider-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ status: "error" })))
    );
    await expect(
      sendCustomerOtp("+919000000001", "123456", "test")
    ).rejects.toMatchObject({ status: 503 });
  });
  it("does not retry an ambiguous SMS timeout", async () => {
    vi.stubEnv("MTM_SMS_PROVIDER", "apitxt");
    vi.stubEnv("APITXT_AUTH_KEY", "fake-unit-test-provider-key");
    const send = vi.fn(async () => {
      throw Error("timeout");
    });
    vi.stubGlobal("fetch", send);
    await expect(
      sendCustomerOtp("+919000000001", "123456", "test")
    ).rejects.toMatchObject({ status: 503 });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
