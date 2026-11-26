/** Public image URLs must point to the publishing merchant's gated Galla endpoint. */
export function publicCatalogueImage(
  value: string | null,
  merchant: string,
  production = process.env.MTM_APNA_CONNECTOR_MODE === "production"
) {
  if (value === null) return null;
  const url = new URL(value);
  const base = production
    ? new URL("https://api.apnagalla.in/")
    : new URL(process.env.APNA_SANDBOX_URL || "https://localhost/");
  const escaped = merchant.replace(/[^a-f0-9-]/gi, "");
  if (
    escaped !== merchant ||
    !/^[a-f0-9-]{36}$/i.test(merchant) ||
    url.origin !== base.origin ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !new RegExp(
      "^/api/v1/retail/mytown/media/" + escaped + "/[a-f0-9-]{36}$",
      "i"
    ).test(url.pathname)
  )
    throw Error("Invalid public catalogue photo");
  return url.href;
}
