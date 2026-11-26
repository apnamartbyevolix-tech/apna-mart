import { describe, it, expect } from "vitest";
import { publicCatalogueImage } from "./public-media";
const merchant = "c6e9a021-30bc-4bb0-8b23-a836cb74aa84",
  photo = "a31b1903-542a-4124-955c-e48e9ee78926";
const valid = `https://api.apnagalla.in/api/v1/retail/mytown/media/${merchant}/${photo}`;
describe("published catalogue photos", () => {
  it("allows only the publisher's gated Galla image and explicit removal", () => {
    expect(publicCatalogueImage(valid, merchant, true)).toBe(valid);
    expect(publicCatalogueImage(null, merchant, true)).toBeNull();
  });
  it.each([
    valid.replace("api.apnagalla.in", "evil.invalid"),
    valid.replace(merchant, photo),
    valid + "?token=private",
    valid + "#x",
    valid.replace("/retail/mytown/media/", "/attachments/"),
    valid.replace("https:", "http:"),
    valid.replace("https://", "https://user:pass@"),
  ])("rejects untrusted, private or other-shop URLs: %s", value =>
    expect(() => publicCatalogueImage(value, merchant, true)).toThrow()
  );
});
