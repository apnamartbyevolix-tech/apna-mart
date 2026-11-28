import "@/pages/customer-discovery.css";
import { MartPushBridge } from "./CustomerNotifications";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  House,
  MapPin,
  Search,
  ShoppingBag,
  Store,
  UserRound,
  LayoutGrid,
  BadgePercent,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { ReviewDemoBanner } from "./ReviewDemoSignIn";
import {
  formatINR,
  type MarketProduct,
  type RouterOutputs,
} from "@/lib/marketplace";

import {
  parseCart,
  readPreference,
  restoreBrowserCart,
  type CartLine,
} from "@/lib/cart";
export type { CartLine } from "@/lib/cart";
type MarketContextValue = {
  auth: ReturnType<typeof useAuth>;
  cart: CartLine[];
  cartNotice: string;
  townId?: number;
  zoneId?: number;
  townName: string;
  locality: string;
  setTown: (value: string) => void;
  selectArea: (townId: number, zoneId: number) => boolean;
  setLocality: (value: string) => void;
  areas: RouterOutputs["marketplace"]["areas"] | undefined;
  areasLoading: boolean;
  reloadAreas: () => unknown;
  addToCart: (product: MarketProduct, quantity?: number) => void;
  replaceCart: (items: CartLine[]) => void;
  setQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
};
const MarketContext = createContext<MarketContextValue | null>(null);

export const useMarket = () => {
  const value = useContext(MarketContext);
  if (!value) throw new Error("useMarket must be used within MarketProvider");
  return value;
};

export function MarketProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [restored] = useState(restoreBrowserCart);
  const [storageNotice, setStorageNotice] = useState(restored.notice);
  const [cart, setCart] = useState<CartLine[]>(restored.cart);
  const [townChoice, setTownChoice] = useState(() =>
    readPreference("mytown-market-town-v1")
  );
  const [zoneChoice, setZoneChoice] = useState(
    () =>
      readPreference("mytown-market-zone-v1") ||
      readPreference("mytown-market-locality-v1")
  );
  const areasQuery = trpc.marketplace.areas.useQuery(undefined, {
    staleTime: 60_000,
  });
  const towns = areasQuery.data?.towns ?? [];
  const requestedTown = Number(townChoice);
  const activeTown = towns.find(t => t.id === requestedTown) ?? towns[0];
  const townId = activeTown?.id;
  const townName = activeTown ? `${activeTown.name}, ${activeTown.state}` : "";
  const zones = (areasQuery.data?.zones ?? []).filter(
    zone => zone.townId === townId
  );
  const selectedZone =
    zones.find(zone => String(zone.id) === zoneChoice) ??
    zones.find(zone => zone.locality === zoneChoice);
  const zoneId = selectedZone?.id;
  const locality = selectedZone?.locality ?? "";

  useEffect(() => {
    try {
      if (cart.length)
        window.localStorage.setItem(
          "mytown-market-cart-v1",
          JSON.stringify(cart)
        );
      else window.localStorage.removeItem("mytown-market-cart-v1");
    } catch {
      setStorageNotice(
        "Cart storage is unavailable. Your cart remains in this tab; check order history before reloading."
      );
    }
  }, [cart]);
  useEffect(() => {
    try {
      if (townId)
        window.localStorage.setItem("mytown-market-town-v1", String(townId));
    } catch {
      /* Optional preference. */
    }
  }, [townId]);
  useEffect(() => {
    if (areasQuery.isLoading || !areasQuery.data) return;
    try {
      if (zoneId)
        window.localStorage.setItem("mytown-market-zone-v1", String(zoneId));
      else window.localStorage.removeItem("mytown-market-zone-v1");
      window.localStorage.removeItem("mytown-market-locality-v1");
    } catch {
      /* Optional preference. */
    }
  }, [zoneId, areasQuery.isLoading, areasQuery.data]);

  const addToCart = (product: MarketProduct, quantity = 1) => {
    if (!product.inStock || product.availability !== "available") {
      toast.error("This product is currently unavailable");
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return;
    const existing =
      cart.find(line => line.product.id === product.id)?.quantity || 0;
    if (
      product.offer?.maxPerOrder &&
      existing + quantity > product.offer.maxPerOrder
    ) {
      toast.error(
        "This offer allows up to " +
          product.offer.maxPerOrder +
          " units per order"
      );
      return;
    }
    if (
      cart.length >= 50 &&
      !cart.some(line => line.product.id === product.id)
    ) {
      toast.error("An order can contain up to 50 products");
      return;
    }
    const currentShop = cart[0]?.product.shopId;
    if (currentShop && currentShop !== product.shopId) {
      if (
        !window.confirm(
          "Your cart contains items from another shop. Replace it with this shop's items?"
        )
      )
        return;
      setCart([{ product, quantity }]);
    } else {
      setCart(current => {
        const found = current.find(line => line.product.id === product.id);
        return found
          ? current.map(line =>
              line.product.id === product.id
                ? { ...line, quantity: Math.min(100, line.quantity + quantity) }
                : line
            )
          : [...current, { product, quantity }];
      });
    }
    toast.success("Added to your cart");
  };
  const setQuantity = (productId: number, quantity: number) => {
    if (!Number.isInteger(quantity)) return;
    const limit = cart.find(line => line.product.id === productId)?.product
      .offer?.maxPerOrder;
    if (limit && quantity > limit) {
      toast.error("This offer allows up to " + limit + " units per order");
      return;
    }
    setCart(current =>
      quantity <= 0
        ? current.filter(line => line.product.id !== productId)
        : current.map(line =>
            line.product.id === productId
              ? { ...line, quantity: Math.min(quantity, 100) }
              : line
          )
    );
  };
  const replaceCart = (items: CartLine[]) => {
    const restored = parseCart(JSON.stringify(items));
    if (restored.notice) {
      toast.error(
        "These items could not form a safe one-seller cart. Please add them individually."
      );
      return;
    }
    setCart(restored.cart);
  };
  const setTown = (value: string) => {
    setTownChoice(value);
    setZoneChoice("");
  };
  // The selector value is a service-zone ID; the display label is the zone's locality.
  const setLocality = (value: string) => setZoneChoice(value);
  const value = useMemo(
    () => ({
      auth,
      cart,
      cartNotice: storageNotice,
      townId,
      zoneId,
      townName,
      locality,
      setTown,
      selectArea: (nextTown: number, nextZone: number) => {
        if (
          !areasQuery.data?.zones.some(
            zone => zone.id === nextZone && zone.townId === nextTown
          )
        )
          return false;
        if (
          zoneId &&
          zoneId !== nextZone &&
          cart.length &&
          !window.confirm(
            "Changing your area clears this shop's cart. Continue?"
          )
        )
          return false;
        if (zoneId && zoneId !== nextZone) setCart([]);
        setTownChoice(String(nextTown));
        setZoneChoice(String(nextZone));
        return true;
      },
      setLocality,
      areas: areasQuery.data,
      areasLoading: areasQuery.isLoading,
      reloadAreas: areasQuery.refetch,
      addToCart,
      replaceCart,
      setQuantity,
      clearCart: () => setCart([]),
    }),
    [
      auth,
      cart,
      storageNotice,
      townId,
      zoneId,
      townName,
      locality,
      areasQuery.data,
      areasQuery.isLoading,
    ]
  );

  return (
    <MarketContext.Provider value={value}><MartPushBridge user={auth.user} loading={auth.loading}/>{children}</MarketContext.Provider>
  );
}

export function LoginButton({
  children = "Sign in",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const [location, navigate] = useLocation();
  return (
    <Button
      className={className}
      onClick={() => {
        navigate("/login?returnTo=" + encodeURIComponent(location));
      }}
    >
      {children}
      <ArrowRight className="size-4" />
    </Button>
  );
}

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand-lockup" aria-label="Apna Mart home">
      <img
        src="/brand/apna-mart-icon-192.png"
        alt=""
        width={36}
        height={36}
        className="shrink-0 object-contain"
      />
      {!compact && (
        <span className="brand-wordmark">
          Apna <b>Mart</b>
        </span>
      )}
    </Link>
  );
}

export { CustomerShell as MarketShell } from "./CustomerShell";
