import type { MarketProduct } from "./marketplace";

export type CartLine = { product: MarketProduct; quantity: number };
type StorageAccess = () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
const browserStorage: StorageAccess = () => window.localStorage;
const CART_KEY = "mytown-market-cart-v1";
const CHECKOUT_KEY = "mytown-market-checkout-key-v1";

export function readPreference(key: string) {
  try {
    return browserStorage().getItem(key) ?? "";
  } catch {
    return "";
  }
}

export function parseCart(raw: string | null): {
  cart: CartLine[];
  notice: string;
} {
  try {
    const lines = JSON.parse(raw ?? "[]");
    if (!Array.isArray(lines) || lines.length > 50) throw Error("Invalid cart");
    const ids = new Set<number>();
    let shopId: number | undefined;
    const cart = lines.map((line: CartLine) => {
      const p = line?.product;
      if (
        !p ||
        !Number.isSafeInteger(p.id) ||
        p.id <= 0 ||
        !Number.isSafeInteger(p.shopId) ||
        p.shopId <= 0 ||
        !Number.isInteger(line.quantity) ||
        line.quantity < 1 ||
        line.quantity > 100 ||
        typeof p.name !== "string" ||
        !p.name.trim() ||
        typeof p.unit !== "string" ||
        !Number.isSafeInteger(p.pricePaise) ||
        p.pricePaise < 0 ||
        p.pricePaise > 2_147_483_647 ||
        (p.mrpPaise != null &&
          (!Number.isSafeInteger(p.mrpPaise) || p.mrpPaise < 0)) ||
        ids.has(p.id) ||
        (shopId !== undefined && shopId !== p.shopId)
      )
        throw Error("Invalid cart");
      ids.add(p.id);
      shopId = p.shopId;
      return {
        quantity: line.quantity,
        product: {
          id: p.id,
          shopId: p.shopId,
          name: p.name,
          unit: p.unit,
          pricePaise: p.pricePaise,
          mrpPaise: p.mrpPaise ?? null,
          image:
            typeof p.image === "string" ? p.image : "/product-placeholder.svg",
          category: typeof p.category === "string" ? p.category : "",
          availability:
            typeof p.availability === "string" ? p.availability : "unavailable",
          inStock: p.inStock === true,
          isDemo: p.isDemo === true,
        },
      };
    });
    return { cart, notice: "" };
  } catch {
    return {
      cart: [],
      notice:
        "Your saved cart could not be restored safely. Check order history before adding your items again.",
    };
  }
}

export function restoreBrowserCart(storage: StorageAccess = browserStorage) {
  try {
    return parseCart(storage().getItem(CART_KEY));
  } catch {
    return {
      cart: [],
      notice:
        "Browser storage is unavailable. You can shop in this tab, but your cart cannot survive a reload.",
    };
  }
}

const memoryKeys = new Map<string, string>();
let lastAttempt:
  | { fingerprint: string; key: string; customerId: number }
  | undefined;
export function readCheckoutAttempt(storage: StorageAccess = browserStorage) {
  try {
    const stored = JSON.parse(storage().getItem(CHECKOUT_KEY) ?? "null");
    if (
      typeof stored?.fingerprint === "string" &&
      typeof stored.key === "string" &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
        stored.key
      )
    ) {
      const { customerId } = JSON.parse(stored.fingerprint);
      if (Number.isSafeInteger(customerId) && customerId > 0)
        return { fingerprint: stored.fingerprint, key: stored.key, customerId };
    }
  } catch {
    /* Optional storage. */
  }
  return lastAttempt;
}
export function getCheckoutKey(
  fingerprint: string,
  storage: StorageAccess = browserStorage
) {
  const stored = readCheckoutAttempt(storage);
  let key =
    memoryKeys.get(fingerprint) ??
    (stored?.fingerprint === fingerprint ? stored.key : undefined);
  key ??= crypto.randomUUID();
  memoryKeys.set(fingerprint, key);
  try {
    lastAttempt = {
      key,
      fingerprint,
      customerId: JSON.parse(fingerprint).customerId,
    };
  } catch {
    /* Non-checkout callers have no recoverable customer. */
  }
  try {
    storage().setItem(CHECKOUT_KEY, JSON.stringify({ fingerprint, key }));
  } catch {
    /* Optional storage. */
  }
  return key;
}

export function clearCheckoutKey(
  key: string,
  storage: StorageAccess = browserStorage
) {
  for (const [fingerprint, value] of memoryKeys)
    if (value === key) memoryKeys.delete(fingerprint);
  if (lastAttempt?.key === key) lastAttempt = undefined;
  try {
    const stored = JSON.parse(storage().getItem(CHECKOUT_KEY) ?? "null");
    if (stored?.key === key) storage().removeItem(CHECKOUT_KEY);
  } catch {
    /* Order success remains authoritative. */
  }
}
