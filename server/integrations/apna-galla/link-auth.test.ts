import { describe, it, expect } from "vitest";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import {
  connectionHeaders,
  verifyConnection,
  validateLinkAuth,
} from "./link-auth";
const pair = () => {
  const p = generateKeyPairSync("ed25519");
  return {
    privateKey: p.privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    publicKey: p.publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64"),
  };
};
const a = pair(),
  m = pair(),
  make = (self: string, own: typeof a, peer: typeof m) => ({
    MYTOWN_LINK_AUTH: "ed25519-v1",
    MYTOWN_LINK_SELF: self,
    MYTOWN_LINK_KEY_ID: "test-" + self + "-key",
    MYTOWN_LINK_PRIVATE_KEY_B64: own.privateKey,
    MYTOWN_LINK_PEER_KEYS_JSON: JSON.stringify([
      {
        id: "test-" + (self === "apna" ? "mytown" : "apna") + "-key",
        peer: self === "apna" ? "mytown" : "apna",
        publicKey: peer.publicKey,
      },
    ]),
  });
const apna = make("apna", a, m),
  mytown = make("mytown", m, a),
  raw = Buffer.from('{"merchantId":"test"}'),
  id = randomUUID(),
  path = "/api/v1/inventory/reserve",
  now = 1793966400000;
const headers = () => ({
  ...connectionHeaders("mytown", "POST", path, raw, id, mytown, now),
  "idempotency-key": id,
});
describe("separate Ed25519 server identities", () => {
  it("allows the bounded large catalogue only on its signed sender and path", () => {
    const large = Buffer.alloc(100000, "x"), path = "/api/internal/apna/catalogue";
    const h = { ...connectionHeaders("apna", "POST", path, large, id, apna, now), "idempotency-key": id };
    expect(() => verifyConnection("apna", "POST", path, large, h, mytown, now)).not.toThrow();
    expect(() => connectionHeaders("apna", "POST", "/api/internal/apna/vendor", large, id, apna, now)).toThrow();
    expect(() => connectionHeaders("mytown", "POST", path, large, id, mytown, now)).toThrow();
    expect(() => connectionHeaders("apna", "POST", path, Buffer.alloc(524289), id, apna, now)).toThrow();
  });
  it("verifies the correct sender with only its pinned public key", () =>
    expect(() =>
      verifyConnection("mytown", "POST", path, raw, headers(), apna, now)
    ).not.toThrow());
  it("supports the reverse direction without sharing private keys", () => {
    const h = {
      ...connectionHeaders(
        "apna",
        "POST",
        "/api/internal/apna/vendor",
        raw,
        id,
        apna,
        now
      ),
      "idempotency-key": id,
    };
    expect(() =>
      verifyConnection(
        "apna",
        "POST",
        "/api/internal/apna/vendor",
        raw,
        h,
        mytown,
        now
      )
    ).not.toThrow();
  });
  it("rejects changed payload, endpoint, method and operation key", () => {
    for (const [method, url, body, h] of [
      ["POST", path, Buffer.from("{}"), headers()],
      ["POST", "/api/v1/orders/sale-post", raw, headers()],
      ["GET", path, raw, headers()],
      ["POST", path, raw, { ...headers(), "idempotency-key": randomUUID() }],
    ] as const)
      expect(() =>
        verifyConnection("mytown", method, url, body, h, apna, now)
      ).toThrow();
  });
  it("rejects expired and future-dated requests", () => {
    expect(() =>
      verifyConnection(
        "mytown",
        "POST",
        path,
        raw,
        headers(),
        apna,
        now + 121000
      )
    ).toThrow();
    expect(() =>
      verifyConnection(
        "mytown",
        "POST",
        path,
        raw,
        headers(),
        apna,
        now - 121000
      )
    ).toThrow();
  });
  it("does not accept another key, missing proof, or the wrong sender", () => {
    expect(() =>
      verifyConnection("mytown", "POST", path, raw, {}, apna, now)
    ).toThrow();
    expect(() =>
      verifyConnection(
        "mytown",
        "POST",
        path,
        raw,
        { ...headers(), "x-mytown-link-key-id": "unknown-key" },
        apna,
        now
      )
    ).toThrow();
    expect(() =>
      verifyConnection("apna", "POST", path, raw, headers(), apna, now)
    ).toThrow();
  });
  it("rejects malformed setup instead of silently disabling authentication", () =>
    expect(() =>
      validateLinkAuth({ ...apna, MYTOWN_LINK_AUTH: "wrong-mode" })
    ).toThrow());
  it("keeps an explicitly unconfigured legacy sandbox unchanged", () =>
    expect(connectionHeaders("apna", "POST", path, raw, id, {})).toEqual({}));
});
