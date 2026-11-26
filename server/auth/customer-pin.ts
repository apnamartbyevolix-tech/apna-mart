import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const validCustomerPin = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}$/.test(value);

async function derive(
  phone: string,
  pin: string,
  salt: string
): Promise<Buffer> {
  const secret = process.env.MTM_OTP_SECRET;
  if (!secret || secret.length < 43)
    throw Error("Customer sign-in is unavailable");
  const input = createHmac("sha256", secret)
    .update("customer-pin-v1:" + phone + ":" + pin)
    .digest();
  return new Promise((resolve, reject) =>
    scrypt(
      input,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key))
    )
  );
}
export async function hashCustomerPin(phone: string, pin: string) {
  if (!validCustomerPin(pin)) throw Error("Choose a four-digit PIN");
  const salt = randomBytes(16).toString("hex");
  return { salt, digest: (await derive(phone, pin, salt)).toString("hex") };
}
export async function verifyCustomerPin(
  phone: string,
  pin: string,
  salt?: string,
  hash?: string
) {
  if (!validCustomerPin(pin)) return false;
  const valid =
    !!salt &&
    /^[a-f0-9]{32}$/.test(salt) &&
    !!hash &&
    /^[a-f0-9]{128}$/.test(hash);
  // Missing identities still perform the same KDF; responses do not disclose membership.
  const candidate = await derive(phone, pin, valid ? salt! : "0".repeat(32));
  return (
    timingSafeEqual(
      candidate,
      Buffer.from(valid ? hash! : "0".repeat(128), "hex")
    ) && valid
  );
}
