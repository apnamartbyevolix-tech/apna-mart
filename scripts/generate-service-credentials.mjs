import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";
const out = process.argv[2],
  environment = process.argv[3] || "local";
if (
  !out ||
  !path.isAbsolute(out) ||
  !["local", "production"].includes(environment)
)
  throw Error(
    "Pass an absolute private output folder and local or production."
  );
const folder = path.resolve(out),
  repo = path.resolve(import.meta.dirname, "..");
if (folder === repo || folder.startsWith(repo + path.sep))
  throw Error("Store server credentials outside the source repository.");
await mkdir(folder, { recursive: true, mode: 0o700 });
const names = ["apna-service.env", "mytown-service.env"];
for (const name of names) {
  try {
    await access(path.join(folder, name));
    throw Error(
      "Credentials already exist; refusing to overwrite or rotate them."
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
const make = peer => {
  const pair = generateKeyPairSync("ed25519");
  return {
    peer,
    id: environment + "-" + peer + "-" + randomBytes(8).toString("hex"),
    privateKey: pair.privateKey
      .export({ format: "der", type: "pkcs8" })
      .toString("base64"),
    publicKey: pair.publicKey
      .export({ format: "der", type: "spki" })
      .toString("base64"),
  };
};
const a = make("apna"),
  m = make("mytown");
for (const [self, peer, name] of [
  [a, m, names[0]],
  [m, a, names[1]],
]) {
  const lines = [
    "# Private server configuration. Never commit or put in VITE_* variables.",
    "MYTOWN_LINK_AUTH=ed25519-v1",
    "MYTOWN_LINK_SELF=" + self.peer,
    "MYTOWN_LINK_KEY_ID=" + self.id,
    "MYTOWN_LINK_PRIVATE_KEY_B64=" + self.privateKey,
    "MYTOWN_LINK_PEER_KEYS_JSON=" +
      JSON.stringify([
        { id: peer.id, peer: peer.peer, publicKey: peer.publicKey },
      ]),
  ];
  if (self.peer === "mytown")
    lines.push(
      "MTM_CUSTOMER_AUTH_ENABLED=1",
      "MTM_OTP_SECRET=" + randomBytes(32).toString("base64url"),
      "MTM_SMS_PROVIDER=" + (environment === "local" ? "test" : "apitxt"),
      "MTM_AUTH_ORIGINS=",
      "APITXT_AUTH_KEY=",
      "APITXT_OTP_TEMPLATE_ID="
    );
  await writeFile(path.join(folder, name), lines.join("\n") + "\n", {
    mode: 0o600,
    flag: "wx",
  });
}
console.log(
  "Generated separate " +
    environment +
    " server credentials in the private output folder. Secret values were not displayed."
);
