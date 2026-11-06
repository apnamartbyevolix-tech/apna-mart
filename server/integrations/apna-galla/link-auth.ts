import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
type Peer = "apna" | "mytown";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyId = /^[a-zA-Z0-9_-]{8,96}$/;
const key = (b64: string, privateKey = false) =>
  privateKey
    ? createPrivateKey({
        key: Buffer.from(b64, "base64"),
        format: "der",
        type: "pkcs8",
      })
    : createPublicKey({
        key: Buffer.from(b64, "base64"),
        format: "der",
        type: "spki",
      });
function config(env: NodeJS.ProcessEnv) {
  if (!env.MYTOWN_LINK_AUTH) return null;
  if (
    env.MYTOWN_LINK_AUTH !== "ed25519-v1" ||
    !["apna", "mytown"].includes(env.MYTOWN_LINK_SELF || "") ||
    !keyId.test(env.MYTOWN_LINK_KEY_ID || "") ||
    !env.MYTOWN_LINK_PRIVATE_KEY_B64
  )
    throw Error("Invalid server connection configuration");
  const privateKey = key(env.MYTOWN_LINK_PRIVATE_KEY_B64, true),
    peers = JSON.parse(env.MYTOWN_LINK_PEER_KEYS_JSON || "[]") as {
      id: string;
      peer: Peer;
      publicKey: string;
    }[];
  if (
    privateKey.asymmetricKeyType !== "ed25519" ||
    !Array.isArray(peers) ||
    !peers.length ||
    peers.length > 4 ||
    peers.some(
      p =>
        !keyId.test(p.id) ||
        !["apna", "mytown"].includes(p.peer) ||
        p.peer === env.MYTOWN_LINK_SELF ||
        key(p.publicKey).asymmetricKeyType !== "ed25519"
    )
  )
    throw Error("Invalid pinned peer keys");
  return {
    self: env.MYTOWN_LINK_SELF as Peer,
    id: env.MYTOWN_LINK_KEY_ID!,
    privateKey,
    peers,
  };
}
function payload(
  peer: Peer,
  id: string,
  method: string,
  path: string,
  at: string,
  requestId: string,
  raw: Buffer
) {
  if (
    method !== "POST" ||
    !/^\/[a-zA-Z0-9/_-]{1,199}$/.test(path) ||
    !uuid.test(requestId) ||
    !raw.length ||
    raw.length > 65536
  )
    throw Error("Invalid signed request");
  return Buffer.from(
    [
      "MYTOWN-LINK-1",
      peer,
      id,
      method,
      path,
      at,
      requestId,
      createHash("sha256").update(raw).digest("hex"),
    ].join("\n")
  );
}
export function validateLinkAuth(env = process.env) {
  config(env);
}
export function connectionHeaders(
  sender: Peer,
  method: string,
  path: string,
  raw: Buffer,
  requestId: string,
  env = process.env,
  now = Date.now()
): Record<string, string> {
  const c = config(env);
  if (!c) return {};
  if (c.self !== sender) throw Error("Connection signer mismatch");
  const at = String(Math.floor(now / 1000));
  const signature = sign(
    null,
    payload(sender, c.id, method, path, at, requestId, raw),
    c.privateKey
  ).toString("base64url");
  return {
    "x-mytown-link-version": "1",
    "x-mytown-link-sender": sender,
    "x-mytown-link-key-id": c.id,
    "x-mytown-link-time": at,
    "x-mytown-link-signature": signature,
  };
}
export function verifyConnection(
  expected: Peer,
  method: string,
  path: string,
  raw: Buffer,
  headers: Record<string, any>,
  env = process.env,
  now = Date.now()
) {
  const c = config(env);
  if (!c) return;
  const at = String(headers["x-mytown-link-time"] || ""),
    id = String(headers["x-mytown-link-key-id"] || ""),
    signature = String(headers["x-mytown-link-signature"] || ""),
    requestId = String(headers["idempotency-key"] || ""),
    peer = c.peers.find(p => p.id === id && p.peer === expected);
  if (
    headers["x-mytown-link-version"] !== "1" ||
    headers["x-mytown-link-sender"] !== expected ||
    !peer ||
    !/^\d{10}$/.test(at) ||
    Math.abs(now / 1000 - Number(at)) > 120 ||
    !/^[A-Za-z0-9_-]{86}$/.test(signature) ||
    !verify(
      null,
      payload(expected, id, method, path, at, requestId, raw),
      key(peer.publicKey),
      Buffer.from(signature, "base64url")
    )
  )
    throw Error("Invalid server signature");
}
