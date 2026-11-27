import { describe, it, expect } from "vitest";
import { marketLanguage, translate } from "./i18n";
describe("customer language preferences", () => {
  it("accepts only the three supported language codes", () => {
    expect(marketLanguage("hi")).toBe("hi");
    expect(marketLanguage("hinglish")).toBe("hinglish");
    expect(marketLanguage("ar")).toBe("en");
    expect(marketLanguage(null)).toBe("en");
  });
  it("translates controls without altering unknown shop/product data", () => {
    expect(translate("hi", "View cart")).toBe("कार्ट देखें");
    expect(translate("hinglish", "View cart")).toBe("Cart dekhein");
    expect(translate("en", "View cart")).toBe("View cart");
    expect(translate("hi", "Sharma Kirana")).toBe("Sharma Kirana");
  });
});
