import express, { type Express } from "express";
import { z } from "zod";

const coordinates = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();
export function createLocationLookup(
  send: typeof fetch = fetch,
  now = Date.now
) {
  let nextRequest = 0,
    active = false;
  const cache = new Map<string, { postalCode: string; until: number }>();
  return async (input: unknown) => {
    const { latitude, longitude } = coordinates.parse(input);
    // Approximate location is sufficient for an area suggestion, never a delivery address.
    const lat = latitude.toFixed(2),
      lon = longitude.toFixed(2),
      key = lat + ":" + lon;
    const found = cache.get(key);
    if (found && found.until > now()) return { postalCode: found.postalCode };
    if (active || now() < nextRequest) throw Error("BUSY");
    active = true;
    nextRequest = now() + 1000;
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.search = new URLSearchParams({
        format: "jsonv2",
        lat,
        lon,
        zoom: "18",
        addressdetails: "1",
      }).toString();
      const response = await send(url, {
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: {
          "User-Agent":
            "ApnaMart/1.0 (https://apna-mart.in; supportapnagalla@gmail.com)",
          Accept: "application/json",
        },
      });
      if (!response.ok || !response.body) throw Error("UNAVAILABLE");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 32768) {
            await reader.cancel();
            throw Error("UNAVAILABLE");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const postalCode = result.address?.postcode;
      if (
        result.address?.country_code !== "in" ||
        typeof postalCode !== "string" ||
        !/^\d{6}$/.test(postalCode)
      )
        throw Error("NOT_FOUND");
      for (const [id, entry] of cache)
        if (entry.until <= now()) cache.delete(id);
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
      cache.set(key, { postalCode, until: now() + 86400000 });
      return { postalCode };
    } finally {
      active = false;
    }
  };
}
export function registerLocation(app: Express) {
  const lookup = createLocationLookup();
  app.post(
    "/api/location/reverse",
    express.json({ limit: "1kb" }),
    async (req, res) => {
      res.set("Cache-Control", "no-store");
      if (!coordinates.safeParse(req.body).success) {
        res.status(400).json({ message: "Enter a valid location." });
        return;
      }
      try {
        res.json(await lookup(req.body));
      } catch (error) {
        res
          .status(
            error instanceof Error && error.message === "BUSY" ? 429 : 503
          )
          .json({
            message:
              "Location lookup is unavailable. Please enter your pincode.",
          });
      }
    }
  );
}
