import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowRight,
  BadgePercent,
  ChevronDown,
  House,
  LayoutGrid,
  LocateFixed,
  MapPin,
  Search,
  ShoppingBag,
  UserRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { BrandMark, useMarket } from "./MarketChrome";
import { LanguageSelect, useLanguage } from "@/contexts/LanguageContext";
import { ReviewDemoBanner } from "./ReviewDemoSignIn";
import { trpc } from "@/lib/trpc";
import { formatINR } from "@/lib/marketplace";

export function CustomerShell({ children }: { children: ReactNode }) {
  const market = useMarket();
  const { t } = useLanguage();
  const [location, navigate] = useLocation();
  const [areaOpen, setAreaOpen] = useState(false),
    [areaSearch, setAreaSearch] = useState("");
  const [search, setSearch] = useState(""),
    [searchTerm, setSearchTerm] = useState(""),
    [searchOpen, setSearchOpen] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false),
    [geoError, setGeoError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setSearchOpen(false);
  }, [location]);
  const suggestions = trpc.marketplace.search.useQuery(
    { q: searchTerm, townId: market.townId || -1, zoneId: market.zoneId || -1 },
    {
      enabled: searchOpen && searchTerm.length >= 2 && !!market.zoneId,
      staleTime: 15_000,
      retry: false,
    }
  );
  const count = market.cart.reduce((sum, line) => sum + line.quantity, 0);
  const selectedZone = market.areas?.zones.find(z => z.id === market.zoneId);
  const selectedTown = market.areas?.towns.find(
    town => town.id === market.townId
  );
  const areas = (market.areas?.zones || []).flatMap(zone => {
    const town = market.areas?.towns.find(town => town.id === zone.townId);
    if (!town) return [];
    const label = [town.name, town.state, zone.locality, zone.postalCode]
      .join(" ")
      .toLowerCase();
    return !areaSearch.trim() || label.includes(areaSearch.trim().toLowerCase())
      ? [{ zone, town }]
      : [];
  });
  const chooseArea = (townId: number, zoneId: number) => {
    if (!market.selectArea(townId, zoneId)) return;
    setAreaOpen(false);
    setGeoError("");
    setSearchOpen(false);
  };
  const locate = () => {
    if (geoBusy) return;
    setGeoError("");
    if (!navigator.geolocation) {
      setGeoError("Location is unavailable. Please enter your pincode.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      async position => {
        try {
          const response = await fetch("/api/location/reverse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw Error();
          const result = await response.json();
          if (
            typeof result.postalCode !== "string" ||
            !/^\d{6}$/.test(result.postalCode)
          )
            throw Error();
          setAreaSearch(result.postalCode);
        } catch {
          setGeoError(
            "We could not match your location. Please enter your pincode."
          );
        } finally {
          setGeoBusy(false);
        }
      },
      () => {
        setGeoError(
          "Location was not shared. You can still enter your pincode."
        );
        setGeoBusy(false);
      },
      { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false }
    );
  };
  const submitSearch = () => {
    if (!market.zoneId) {
      setAreaOpen(true);
      return;
    }
    setSearchOpen(false);
    navigate("/search?q=" + encodeURIComponent(search.trim()));
  };
  const nav = [
    { href: "/", label: "Home", icon: House },
    { href: "/categories", label: "Categories", icon: LayoutGrid },
    { href: "/offers", label: "Offers", icon: BadgePercent },
    { href: "/cart", label: "Cart", icon: ShoppingBag },
    { href: "/account", label: "Account", icon: UserRound },
  ];
  const active = (href: string) =>
    href === "/"
      ? location === "/"
      : href === "/account"
        ? /^\/(account|orders|login|favorites|support)/.test(location)
        : href === "/cart"
          ? /^\/(cart|checkout)/.test(location)
          : location.startsWith(href);
  return (
    <div className="app-frame mart-experience">
      <a href="#main-content" className="mart-skip-link">
        Skip to content
      </a>
      {market.auth.user?.loginMethod === "review-demo" && <ReviewDemoBanner />}
      <header className="mart-header">
        <div className="mart-header-inner">
          <div className="mart-brand-row">
            <BrandMark />
            <div className="mart-header-actions">
              <LanguageSelect />
              <Link
                href="/account"
                aria-label={t("Your account")}
                className="mart-icon"
              >
                <UserRound size={22} />
              </Link>
              <Link href="/cart" aria-label={t("Cart")} className="mart-icon">
                <ShoppingBag size={22} />
                {count > 0 && <b className="mart-cart-count">{count}</b>}
              </Link>
            </div>
          </div>
          <button
            className="mart-location-button"
            onClick={() => setAreaOpen(true)}
            aria-haspopup="dialog"
          >
            <MapPin size={21} />
            <span>
              <strong>
                {market.areasLoading
                  ? t("Loading service areas…")
                  : market.zoneId
                    ? `${selectedTown?.name || market.townName} · ${selectedZone?.postalCode || market.locality}`
                    : t("Choose your area")}
              </strong>
              <small>{t("Delivery or pickup")}</small>
            </span>
            <ChevronDown size={18} />
          </button>
          <form
            className="mart-search"
            role="search"
            onSubmit={e => {
              e.preventDefault();
              submitSearch();
            }}
          >
            <Search size={20} />
            <input
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={e => {
                if (e.key === "Escape") setSearchOpen(false);
              }}
              placeholder={t("Search products or shops")}
              aria-label={t("Search products or shops")}
              maxLength={200}
            />
            <button aria-label={t("Search")} type="submit">
              <ArrowRight size={19} />
            </button>
            {searchOpen && searchTerm.length >= 2 && !!market.zoneId && (
              <div className="mart-search-results">
                <strong>{t("Search results")}</strong>
                {suggestions.isFetching && <p role="status">{t("Loading…")}</p>}
                {suggestions.error && (
                  <p role="status">
                    {t("Search is temporarily unavailable. Please try again.")}
                  </p>
                )}
                {suggestions.data?.products.slice(0, 4).map(product => (
                  <Link
                    key={product.id}
                    href={"/product/" + product.id}
                    onClick={() => setSearchOpen(false)}
                  >
                    <span>
                      {product.name}
                      <small>{product.shopName}</small>
                    </span>
                    <b>{formatINR(product.pricePaise)}</b>
                  </Link>
                ))}
                <button type="button" onClick={submitSearch}>
                  {t("See all")} <ArrowRight size={16} />
                </button>
              </div>
            )}
          </form>
        </div>
        <nav className="mart-desktop-nav" aria-label="Main navigation">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
            >
              <Icon size={18} />
              {t(label)}
            </Link>
          ))}
        </nav>
      </header>
      <main
        id="main-content"
        className="page-content"
        onClick={() => setSearchOpen(false)}
      >
        {market.cartNotice && (
          <div className="cart-storage-notice" role="status">
            {t(market.cartNotice)}
          </div>
        )}
        {!market.zoneId && !market.areasLoading && location !== "/login" && (
          <button
            className="mart-area-notice"
            onClick={() => setAreaOpen(true)}
          >
            <MapPin size={20} />
            <span>
              <strong>{t("Shop in your neighbourhood")}</strong>
              <small>{t("Enter your pincode")}</small>
            </span>
            <ArrowRight size={20} />
          </button>
        )}
        {children}
      </main>
      <footer className="mart-footer">
        <BrandMark />
        <p>
          {t("Your local shops")} · {t("Delivery or pickup")}
        </p>
        <div>
          <Link href="/support">{t("Help & support")}</Link>
          <Link href="/privacy">{t("Privacy")}</Link>
          <Link href="/account-deletion">{t("Account deletion")}</Link>
        </div>
      </footer>
      <div className="customer-dock">
        {count > 0 && !/^\/(cart|checkout)/.test(location) && (
          <Link href="/cart" className="mart-cart-peek">
            <ShoppingBag size={20} />
            <strong>{count}</strong>
            <span>{t("View cart")}</span>
            <ArrowRight size={19} />
          </Link>
        )}
        <nav className="mart-mobile-nav" aria-label="Main navigation">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
            >
              <Icon size={22} />
              <span>
                {t(label)}
                {href === "/cart" && count > 0 ? ` · ${count}` : ""}
              </span>
            </Link>
          ))}
        </nav>
      </div>
      <Dialog open={areaOpen} onOpenChange={setAreaOpen}>
        <DialogContent className="mart-area-dialog">
          <DialogTitle>{t("Choose your area")}</DialogTitle>
          <DialogDescription>
            {t("Choose a service area to see its shops, products and offers.")}
          </DialogDescription>
          <label className="mart-area-input">
            <span>{t("Town or six-digit pincode")}</span>
            <input
              autoComplete="postal-code"
              value={areaSearch}
              onChange={e => setAreaSearch(e.target.value)}
              maxLength={100}
              placeholder={t("Enter your pincode")}
            />
          </label>
          <button
            type="button"
            className="mart-locate"
            disabled={geoBusy}
            onClick={locate}
          >
            <LocateFixed size={18} />
            {t(geoBusy ? "Finding your area…" : "Use my location")}
          </button>
          {geoError && (
            <p role="status" className="mart-field-error">
              {t(geoError)}
            </p>
          )}
          <div className="mart-area-options">
            {market.areasLoading ? (
              <p role="status">{t("Loading service areas…")}</p>
            ) : !market.areas ? (
              <p role="status">
                {t("Service areas could not be loaded. Please try again.")}
              </p>
            ) : areas.length ? (
              areas.map(({ zone, town }) => (
                <button
                  key={zone.id}
                  onClick={() => chooseArea(town.id, zone.id)}
                >
                  <MapPin size={18} />
                  <span>
                    <strong>
                      {town.name} · {zone.postalCode || zone.locality}
                    </strong>
                    <small>
                      {town.state}
                      {zone.locality !== zone.postalCode &&
                      zone.locality !== town.name
                        ? ` · ${zone.locality}`
                        : ""}
                    </small>
                  </span>
                  <ArrowRight size={18} />
                </button>
              ))
            ) : (
              <div>
                <strong>{t("No matching service areas")}</strong>
                <p>
                  {t(
                    "Try another pincode or town. We only show areas currently served by local shops."
                  )}
                </p>
              </div>
            )}
          </div>
          <small className="mart-location-attribution">
            Location lookup © OpenStreetMap contributors. Confirm the area
            before shopping.
          </small>
        </DialogContent>
      </Dialog>
    </div>
  );
}
