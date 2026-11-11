import "@/pages/customer-discovery.css";
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
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
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
  setLocality: (value: string) => void;
  areas: RouterOutputs["marketplace"]["areas"] | undefined;
  areasLoading: boolean;
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
      setLocality,
      areas: areasQuery.data,
      areasLoading: areasQuery.isLoading,
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
    <MarketContext.Provider value={value}>{children}</MarketContext.Provider>
  );
}

export function LoginButton({
  children = "Continue with Manus",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  const [, navigate] = useLocation();
  return (
    <Button
      className={className}
      onClick={() => {
        if (
          !window.__MANUS_CONFIG__?.oauthPortalUrl ||
          !window.__MANUS_CONFIG__?.projectId
        ) {
          navigate("/login");
          return;
        }
        try {
          startLogin();
        } catch {
          toast.error(
            "Manus sign-in is not configured for this environment yet."
          );
        }
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
      <span className="brand-symbol">
        <MapPin className="size-5" strokeWidth={2.4} />
        <span className="brand-leaf" />
      </span>
      {!compact && (
        <span className="brand-wordmark">
          Apna <b>Mart</b>
        </span>
      )}
    </Link>
  );
}

export function MarketShell({ children }: { children: ReactNode }) {
  const {
    cart,
    cartNotice,
    locality,
    setTown,
    setLocality,
    townId,
    zoneId,
    areas,
    areasLoading,
    auth,
  } = useMarket();
  const [location] = useLocation();
  const [search, setSearch] = useState("");
  const [searchTerm, setSearchTerm] = useState(""),
    [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);
  const suggestions = trpc.marketplace.search.useQuery(
    { q: searchTerm, townId: townId || -1, zoneId: zoneId || -1 },
    {
      enabled: searchOpen && searchTerm.length >= 2 && !!townId && !!zoneId,
      staleTime: 5000,
    }
  );
  const submitSearch = () => {
    setSearchOpen(false);
    navigate("/search?q=" + encodeURIComponent(search.trim()));
  };
  const [, navigate] = useLocation();
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const workspace = false;
  const towns = areas?.towns ?? [];
  const localZones = (areas?.zones ?? []).filter(
    zone => zone.townId === townId
  );
  const zoneChoice = zoneId ? String(zoneId) : "";

  return (
    <div
      className={"app-frame" + (location === "/login" ? " login-route" : "")}
    >
      <div className="demo-strip">
        {workspace
          ? "Protected marketplace workspace · actions are authorized by the server"
          : "Fictional demo listings are labelled · prices and stock come from the marketplace database"}
      </div>
      <header className="market-header">
        <div className="header-main">
          <BrandMark />
          <div
            className="location-picker"
            aria-label="Choose marketplace location"
          >
            <MapPin className="size-4 text-leaf" />
            <span>
              <small>
                {areasLoading
                  ? "LOADING SERVICE AREAS"
                  : towns.length
                    ? "SHOP IN"
                    : "NO ACTIVE SERVICE AREAS"}
              </small>
              <select
                aria-label="Town"
                value={townId ? String(townId) : ""}
                onChange={e => setTown(e.target.value)}
                disabled={areasLoading || towns.length === 0}
              >
                <option value="">Choose town</option>
                {towns.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}, {t.state}
                  </option>
                ))}
              </select>
              <select
                aria-label="Service area"
                value={zoneChoice}
                onChange={e => setLocality(e.target.value)}
                disabled={!townId || localZones.length === 0}
              >
                <option value="">Choose service area</option>
                {localZones.map(zone => (
                  <option key={zone.id} value={zone.id}>
                    {zone.locality}
                    {zone.name && zone.name !== zone.locality
                      ? ` · ${zone.name}`
                      : ""}
                    {zone.postalCode ? ` · ${zone.postalCode}` : ""}
                  </option>
                ))}
              </select>
              {zoneId && (
                <small className="selected-locality">
                  {locality} · service area selected
                </small>
              )}
            </span>
          </div>
          <div className="header-links">
            <Link href="/offers" className="header-text-link">
              <BadgePercent className="size-4" /> Today’s offers
            </Link>
            <Link
              href="/account"
              aria-label="Your account"
              className="header-icon-link"
            >
              <UserRound className="size-4" />
              <span>{auth.user?.name || "Account"}</span>
            </Link>
            <Link
              href="/cart"
              aria-label={"Your cart" + (count ? ", " + count + " items" : "")}
              className="header-icon-link cart-link"
            >
              <ShoppingBag className="size-4" />
              <span>Cart</span>
              {count > 0 && <b className="cart-count">{count}</b>}
            </Link>
          </div>
        </div>
        {!workspace && (
          <div className="search-row">
            <Search className="search-icon size-5" />
            <input
              value={search}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 180)}
              onChange={e => {
                setSearch(e.target.value);
                setSearchOpen(true);
              }}
              onKeyDown={e => {
                if (e.key === "Enter") submitSearch();
                if (e.key === "Escape") setSearchOpen(false);
              }}
              placeholder="Search shops, products and essentials…"
              aria-label="Search local shops and products"
              aria-controls={
                searchOpen && searchTerm.length >= 2
                  ? "local-search-suggestions"
                  : undefined
              }
            />
            {search && (
              <button onClick={submitSearch} className="search-submit">
                Search
              </button>
            )}
            {searchOpen && searchTerm.length >= 2 && zoneId && (
              <div
                id="local-search-suggestions"
                className="local-search-suggestions"
              >
                <small>IN YOUR SELECTED AREA</small>
                {suggestions.isFetching && (
                  <p role="status">Finding local products…</p>
                )}
                {suggestions.error && (
                  <p>Search is temporarily unavailable. Please try again.</p>
                )}
                {!suggestions.isFetching && !suggestions.error && (
                  <>
                    {suggestions.data?.products.slice(0, 4).map(p => (
                      <Link
                        key={p.id}
                        href={"/product/" + p.id}
                        onClick={() => setSearchOpen(false)}
                      >
                        <Search size={15} />
                        <span>
                          <strong>{p.name}</strong>
                          <small>{p.shopName}</small>
                        </span>
                        <b>{formatINR(p.pricePaise)}</b>
                      </Link>
                    ))}
                    {suggestions.data?.shops.slice(0, 2).map(p => (
                      <Link
                        key={"s" + p.id}
                        href={"/shop/" + p.id}
                        onClick={() => setSearchOpen(false)}
                      >
                        <Store size={15} />
                        <span>
                          <strong>{p.shopName}</strong>
                          <small>Shop</small>
                        </span>
                        <ArrowRight size={15} />
                      </Link>
                    ))}
                  </>
                )}
                <button onClick={submitSearch}>
                  See all results for “{search.trim()}”<ArrowRight size={15} />
                </button>
              </div>
            )}
          </div>
        )}
      </header>
      <main className="page-content">
        {cartNotice && (
          <div className="service-area-empty" role="status">
            {cartNotice}
          </div>
        )}
        {!workspace &&
          !areasLoading &&
          (!towns.length || !areas?.zones.length) && (
            <div className="service-area-empty">
              <MapPin />
              <span>
                <strong>
                  {!towns.length
                    ? "No active towns are available yet."
                    : "No active service zones are available yet."}
                </strong>
                <small>
                  {!towns.length
                    ? "The marketplace will appear here when a town is activated."
                    : "Ask an administrator to add an active service zone."}
                </small>
              </span>
            </div>
          )}
        {!workspace &&
          !areasLoading &&
          Boolean(townId) &&
          !zoneId &&
          localZones.length > 0 && (
            <div className="service-area-empty">
              <MapPin />
              <span>
                <strong>Choose your service area.</strong>
                <small>
                  Select your locality above to see shops that can serve it.
                </small>
              </span>
            </div>
          )}
        {children}
      </main>
      <footer className="market-footer">
        <div className="footer-inner">
          <div>
            <BrandMark />
            <p>Good things, from shops around your home.</p>
          </div>
          <div className="footer-links">
            <Link href="/categories">Categories</Link>
            <Link href="/offers">Offers</Link>
            <Link href="/orders">Your orders</Link>
            <Link href="/account">Account & privacy</Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/account-deletion">Account deletion</Link>
          </div>
        </div>
        <p className="footer-note">
          Customer handover codes are shown privately in signed-in orders.
        </p>
      </footer>
      {!workspace && (
        <div className="customer-dock">
          {count > 0 && location !== "/cart" && location !== "/checkout" && (
            <Link href="/cart" className="cart-peek">
              <span>
                <ShoppingBag size={18} /> {count}{" "}
                {count === 1 ? "item" : "items"} in your cart
              </span>
              <strong>
                View cart <ArrowRight size={17} />
              </strong>
            </Link>
          )}
          <nav className="mobile-nav" aria-label="Main navigation">
            <Link href="/" className={location === "/" ? "active" : ""}>
              <House />
              <span>Home</span>
            </Link>
            <Link
              href="/categories"
              className={location.startsWith("/categor") ? "active" : ""}
            >
              <LayoutGrid />
              <span>Categories</span>
            </Link>
            <Link
              href="/offers"
              className={location.startsWith("/offers") ? "active" : ""}
            >
              <BadgePercent />
              <span>Offers</span>
            </Link>
            <Link
              href="/cart"
              className={
                location === "/cart" || location === "/checkout" ? "active" : ""
              }
            >
              <ShoppingBag />
              <span>Cart{count ? ` · ${count}` : ""}</span>
            </Link>
            <Link
              href="/orders"
              className={
                location.startsWith("/orders") ||
                location.startsWith("/account")
                  ? "active"
                  : ""
              }
            >
              <UserRound />
              <span>{auth.user ? "You" : "Sign in"}</span>
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
