import { useLanguage } from "@/contexts/LanguageContext";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  Apple,
  ArrowRight,
  BadgePercent,
  Clock3,
  Carrot,
  CookingPot,
  Heart,
  MapPin,
  Minus,
  Milk,
  NotebookPen,
  Plus,
  Search,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Truck,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  ProductCard,
  QueryState,
  SectionHeading,
  ShopCard,
} from "@/components/MarketCards";
import { useMarket } from "@/components/MarketChrome";
import { trpc } from "@/lib/trpc";
import {
  assetFallback,
  demoNotice,
  imageFallback,
  formatINR,
  toMarketProduct,
  toMarketShop,
} from "@/lib/marketplace";

function CategorySymbol({ name }: { name: string | null }) {
  const symbols: Record<string, typeof Store> = {
    basket: ShoppingBag,
    carrot: Carrot,
    milk: Milk,
    book: NotebookPen,
    apple: Apple,
    wrench: Wrench,
    "cooking-pot": CookingPot,
    shirt: Shirt,
    sparkles: Sparkles,
    home: Store,
    cookie: ShoppingBag,
  };
  const Icon = symbols[name ?? ""] ?? Store;
  return <Icon aria-hidden="true" style={{ width: "1em", height: "1em" }} />;
}

export default function Home() {
  const { townId, zoneId, townName, locality, areas, areasLoading } =
    useMarket();
  const query = trpc.marketplace.home.useQuery(
    { townId: townId ?? -1, zoneId: zoneId ?? -1 },
    { enabled: !areasLoading && Boolean(townId && zoneId) }
  );
  const shops = useMemo(
    () => (query.data?.shops ?? []).map(toMarketShop),
    [query.data]
  );
  const products = useMemo(
    () =>
      (query.data?.products ?? []).map(p =>
        toMarketProduct(
          p,
          p.vendorId,
          query.data?.shops.find(s => s.id === p.vendorId)?.category.slug
        )
      ),
    [query.data]
  );
  return (
    <div className="market-home">
      <section className="hero-banner">
        <div className="hero-copy">
          <span className="hero-kicker">
            <Sparkles /> THE GOOD STUFF, CLOSE BY
          </span>
          <h1>
            Little shops.
            <br />
            <em>Big heart.</em>
          </h1>
          <p>
            Everyday things from the people who know your neighbourhood best.
          </p>
          <Link href="/search" className="hero-cta">
            Explore your market <ArrowRight />
          </Link>
          <span className="hero-location">
            <MapPin /> {locality || townName || "Choose a town above"}
          </span>
        </div>
        <div className="hero-image">
          <img
            src={assetFallback}
            alt="Fresh everyday groceries arranged for a neighbourhood shop"
          />
          <span className="hero-image-caption">
            Your neighbourhood, on your doorstep
          </span>
        </div>
        <div className="hero-leaf leaf-one" />
        <div className="hero-leaf leaf-two" />
      </section>
      <div className="notice-line">
        <span className="notice-dot" />
        {demoNotice}
      </div>
      <QueryState loading={areasLoading || query.isLoading} error={query.error}>
        {!townId ? (
          <EmptyState icon={MapPin} title="No active towns yet">
            Marketplace listings will appear when an administrator activates a
            town.
          </EmptyState>
        ) : !areas?.zones.some(zone => zone.townId === townId) ? (
          <EmptyState
            icon={MapPin}
            title="No active service zones in this town"
          >
            Ask an administrator to add a service zone before browsing local
            listings.
          </EmptyState>
        ) : (
          query.data && (
            <>
              <section className="category-section">
                <SectionHeading
                  eyebrow="A little bit of everything"
                  title="What are you looking for?"
                />
                <div className="category-rail">
                  {query.data.categories.map(category => (
                    <Link
                      key={category.id}
                      href={`/category/${category.slug}`}
                      className="category-tile"
                    >
                      <span className="category-art">
                        <img
                          onError={imageFallback}
                          src={assetFallback}
                          alt=""
                          loading="lazy"
                        />
                        <span>
                          <CategorySymbol name={category.icon} />
                        </span>
                      </span>
                      <strong>{category.name}</strong>
                    </Link>
                  ))}
                </div>
                {query.data.categories.length === 0 && (
                  <div className="soft-empty">
                    No enabled categories are available.
                  </div>
                )}
              </section>
              <section className="promo-banner">
                <div className="promo-copy">
                  <span className="promo-tag">
                    <BadgePercent /> GOOD THINGS, RIGHT AROUND THE CORNER
                  </span>
                  <h2>
                    Keep your cart
                    <br />
                    close to home.
                  </h2>
                  <p>
                    One shop per order means your local seller can pack it just
                    right.
                  </p>
                  <Link href="/search" className="promo-link">
                    Browse nearby shops <ArrowRight />
                  </Link>
                </div>
                <div className="promo-art">
                  <div className="sun-disc" />
                  <div className="market-bag">
                    <ShoppingBag />
                    <span>
                      LOCAL
                      <br />& LOVELY
                    </span>
                  </div>
                  <div className="promo-flower">✳</div>
                </div>
              </section>
              <section className="content-section">
                <SectionHeading
                  eyebrow="Picked for your patch"
                  title="Open local shops"
                  href="/search"
                />
                <QueryState loading={false} empty={!shops.length}>
                  <div className="shop-grid">
                    {shops.slice(0, 4).map(shop => (
                      <ShopCard key={shop.id} shop={shop} />
                    ))}
                  </div>
                </QueryState>
              </section>
              <section className="content-section">
                <SectionHeading
                  eyebrow="Everyday favourites"
                  title="Available products"
                  href="/search"
                />
                <QueryState loading={false} empty={!products.length}>
                  <div className="product-grid">
                    {products.slice(0, 5).map(product => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        shopName={
                          shops.find(s => s.id === product.shopId)?.name
                        }
                      />
                    ))}
                  </div>
                </QueryState>
              </section>
              <section className="content-section">
                <SectionHeading
                  eyebrow="Around your corner"
                  title="Nearby shops"
                  href="/search"
                />
                <QueryState loading={false} empty={!shops.length}>
                  <div className="nearby-list">
                    {shops.map((shop, i) => (
                      <Link
                        key={shop.id}
                        href={`/shop/${shop.id}`}
                        className="nearby-row"
                      >
                        <span className="nearby-number">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="nearby-logo">
                          <img
                            onError={imageFallback}
                            src={shop.image}
                            alt=""
                          />
                        </span>
                        <span className="nearby-info">
                          <strong>{shop.name}</strong>
                          <small>
                            {shop.categoryLabel} · {shop.locality}
                            {shop.isDemo ? " · Fictional demo" : ""}
                          </small>
                        </span>
                        <span className="nearby-eta">
                          <Clock3 />
                          {shop.eta}
                        </span>
                        <ArrowRight className="nearby-arrow" />
                      </Link>
                    ))}
                  </div>
                </QueryState>
              </section>
            </>
          )
        )}
      </QueryState>
      <section className="trust-row">
        <div>
          <ShieldCheck />
          <strong>Local by nature</strong>
          <span>Neighbourhood shops, not warehouses</span>
        </div>
        <div>
          <Truck />
          <strong>One shop at a time</strong>
          <span>Clear delivery or pickup choices</span>
        </div>
        <div>
          <Heart />
          <strong>Made for your town</strong>
          <span>Simple, familiar everyday shopping</span>
        </div>
      </section>
    </div>
  );
}

export function SearchPage() {
  const { townId, zoneId, locality, areas, areasLoading } = useMarket();
  const queryText =
    new URLSearchParams(window.location.search).get("q")?.trim() || "";
  const query = trpc.marketplace.search.useQuery(
    {
      q: queryText || undefined,
      townId: townId ?? -1,
      zoneId: zoneId ?? -1,
    },
    { enabled: !areasLoading && Boolean(townId && zoneId) }
  );
  const shops = (query.data?.shops ?? []).map(toMarketShop);
  const shopByVendor = new Map(shops.map(s => [s.id, s.name]));
  const products = (query.data?.products ?? []).map(p =>
    toMarketProduct(p, p.vendorId)
  );
  return (
    <div className="listing-page">
      <div className="page-intro">
        <p className="eyebrow">THE NEIGHBOURHOOD DIRECTORY</p>
        <h1>Find your local favourite.</h1>
        <p>
          Search currently open shops and available products
          {locality ? ` around ${locality}` : " around your town"}.
        </p>
      </div>
      <QueryState loading={areasLoading || query.isLoading} error={query.error}>
        {!townId ? (
          <EmptyState icon={MapPin} title="No active towns yet">
            Marketplace listings will appear when an administrator activates a
            town.
          </EmptyState>
        ) : !areas?.zones.some(zone => zone.townId === townId) ? (
          <EmptyState
            icon={MapPin}
            title="No active service zones in this town"
          >
            Choose another town or ask an administrator to add a service zone.
          </EmptyState>
        ) : (
          query.data && (
            <>
              {!shops.length && !products.length ? (
                <EmptyState icon={Search} title="No matching shops or products">
                  Try another search or locality. Closed shops and unavailable
                  products aren't included in these results.
                </EmptyState>
              ) : (
                <>
                  <section className="content-section">
                    <SectionHeading
                      title={
                        queryText
                          ? `Shops matching “${queryText}”`
                          : "Shops around your town"
                      }
                    />
                    <div className="shop-grid">
                      {shops.map(shop => (
                        <ShopCard key={shop.id} shop={shop} />
                      ))}
                    </div>
                    {!shops.length && (
                      <p className="soft-empty">No shops match this filter.</p>
                    )}
                  </section>
                  <section className="content-section">
                    <SectionHeading title="Available products" />
                    <div className="product-grid">
                      {products.map(product => (
                        <ProductCard
                          key={product.id}
                          product={product}
                          shopName={shopByVendor.get(product.shopId)}
                        />
                      ))}
                    </div>
                    {!products.length && (
                      <p className="soft-empty">
                        No products match this search.
                      </p>
                    )}
                  </section>
                </>
              )}
            </>
          )
        )}
      </QueryState>
    </div>
  );
}
export function CategoryPage({ slug }: { slug: string }) {
  const { townId, zoneId, locality, areas, areasLoading } = useMarket();
  const home = trpc.marketplace.home.useQuery(
    { townId: townId ?? -1, zoneId: zoneId ?? -1 },
    { enabled: !areasLoading && Boolean(townId && zoneId) }
  );
  const category = home.data?.categories.find(c => c.slug === slug);
  const search = trpc.marketplace.search.useQuery(
    {
      categoryId: category?.id,
      townId: townId ?? -1,
      zoneId: zoneId ?? -1,
    },
    { enabled: Boolean(category && townId && zoneId) }
  );
  const shops = (search.data?.shops ?? []).map(toMarketShop);
  const products = (search.data?.products ?? []).map(p =>
    toMarketProduct(p, p.vendorId)
  );
  if (!home.isLoading && !home.error && !category)
    return <NotAvailable title="Category not found or unavailable" />;
  return (
    <div className="listing-page">
      <Link href="/search" className="back-link">
        <ArrowLeft /> All local shops
      </Link>
      <QueryState
        loading={areasLoading || home.isLoading || search.isLoading}
        error={home.error || search.error}
      >
        {!townId ? (
          <EmptyState icon={MapPin} title="No active towns yet">
            Marketplace listings will appear when an administrator activates a
            town.
          </EmptyState>
        ) : !areas?.zones.some(zone => zone.townId === townId) ? (
          <EmptyState
            icon={MapPin}
            title="No active service zones in this town"
          >
            Choose another town or ask an administrator to add a service zone.
          </EmptyState>
        ) : (
          category &&
          search.data && (
            <>
              <div className="category-banner">
                <div>
                  <span className="eyebrow">EXPLORE THE NEIGHBOURHOOD</span>
                  <h1>{category.name}</h1>
                  <p>Live listings in this enabled marketplace category.</p>
                </div>
                <div className="category-banner-art">
                  <img onError={imageFallback} src={assetFallback} alt="" />
                  <span>
                    <CategorySymbol name={category.icon} />
                  </span>
                </div>
              </div>
              <div className="notice-line">
                <span className="notice-dot" />
                Listings marked fictional are demo seed data; records otherwise
                reflect current backend entries.
              </div>
              <section className="content-section">
                <SectionHeading title="Local shops" />
                <div className="shop-grid">
                  {shops.map(shop => (
                    <ShopCard key={shop.id} shop={shop} />
                  ))}
                </div>
                {!shops.length && (
                  <div className="soft-empty">
                    No shops in this category currently match.
                  </div>
                )}
              </section>
              <section className="content-section">
                <SectionHeading title="Available products" />
                <div className="product-grid">
                  {products.map(p => (
                    <ProductCard
                      key={p.id}
                      product={p}
                      shopName={shops.find(s => s.id === p.shopId)?.name}
                    />
                  ))}
                </div>
                {!products.length && (
                  <div className="soft-empty">
                    No available products currently match.
                  </div>
                )}
              </section>
            </>
          )
        )}
      </QueryState>
    </div>
  );
}
export function ShopPage({ id }: { id: string }) {
  const { auth, townId, zoneId, locality, areasLoading } = useMarket();
  const utils = trpc.useUtils();
  const shopId = Number(id);
  const valid = Number.isSafeInteger(shopId) && shopId > 0;
  const query = trpc.marketplace.shop.useQuery(
    {
      shopId: valid ? shopId : -1,
      townId: townId ?? -1,
      zoneId: zoneId ?? -1,
    },
    { enabled: valid && Boolean(townId && zoneId) }
  );
  const favorites = trpc.marketplace.favoriteShops.useQuery(
    { townId: townId ?? -1, zoneId: zoneId ?? -1 },
    { enabled: Boolean(auth.user && townId && zoneId), retry: false }
  );
  const isFavorite = Boolean(favorites.data?.some(row => row.id === shopId));
  const toggleFavorite = trpc.marketplace.toggleFavorite.useMutation({
    onSuccess: async () => {
      await utils.marketplace.favoriteShops.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const shop = query.data && toMarketShop(query.data);
  const items =
    query.data?.products.map(p =>
      toMarketProduct(p, shopId, query.data.category.slug)
    ) ?? [];
  if (!valid || (query.error && query.error.data?.code === "NOT_FOUND"))
    return <NotAvailable title="We couldn't find that shop" />;
  return (
    <div className="storefront-page">
      <Link href="/search" className="back-link">
        <ArrowLeft /> Back to nearby shops
      </Link>
      <QueryState
        loading={areasLoading || query.isLoading}
        error={
          query.error ||
          (!areasLoading && !townId
            ? new Error("Choose an active town to view this shop")
            : undefined)
        }
      >
        {shop && query.data && (
          <>
            <div className="storefront-cover">
              <img onError={imageFallback} src={shop.image} alt="" />
              <div className="storefront-cover-wash" />
              {shop.isDemo && (
                <span className="demo-sticker">Fictional demo shop</span>
              )}
            </div>
            <div className="storefront-heading">
              <div>
                <span className="eyebrow">
                  {shop.categoryLabel.toUpperCase()} ·{" "}
                  {shop.locality.toUpperCase()}
                </span>
                <h1>{shop.name}</h1>
                <p>{shop.description}</p>
                {query.data.openingTime && query.data.closingTime && (
                  <p className="shop-opening-hours">
                    Online hours: {query.data.openingTime}–
                    {query.data.closingTime} IST
                    {query.data.openingTime > query.data.closingTime
                      ? " · closes next morning"
                      : ""}
                  </p>
                )}
                {shop.ratingCount > 0 && (
                  <p className="shop-rating">
                    <span
                      aria-label={`${shop.ratingAverage?.toFixed(1)} out of 5`}
                    >
                      <Star className="size-3" fill="currentColor" />{" "}
                      {shop.ratingAverage?.toFixed(1)}
                    </span>{" "}
                    · {shop.ratingCount} verified order reviews
                  </p>
                )}
                <span className="open-pill">
                  <span />
                  {shop.isOpen ? "Open for orders" : "Currently closed"}
                </span>
              </div>
              <div className="storefront-stats">
                <span>
                  <Clock3 />
                  {shop.eta}
                </span>
                <span>
                  <MapPin />
                  {shop.locality}, {query.data.town}
                </span>
                <span>
                  {shop.deliveryEnabled
                    ? `Delivery ${formatINR(shop.deliveryFeePaise)}`
                    : "Pickup only"}
                </span>
                <small>Minimum order {formatINR(shop.minimumPaise)}</small>
              </div>
            </div>
            {auth.user ? (
              <Button
                variant="outline"
                disabled={
                  toggleFavorite.isPending || favorites.isLoading || !zoneId
                }
                onClick={() =>
                  toggleFavorite.mutate({
                    shopId,
                    townId: townId!,
                    zoneId: zoneId!,
                    favorited: !isFavorite,
                  })
                }
              >
                <Heart fill={isFavorite ? "currentColor" : "none"} />
                {isFavorite ? "Saved shop" : "Save this shop"}
              </Button>
            ) : (
              <Link href="/account" className="text-link">
                Sign in to save this shop <ArrowRight />
              </Link>
            )}
            {toggleFavorite.error && (
              <p role="alert">{toggleFavorite.error.message}</p>
            )}
            <section className="content-section">
              <SectionHeading
                eyebrow="From this local shop"
                title="Available products"
              />
              <div className="product-grid">
                {items.map(p => (
                  <ProductCard key={p.id} product={p} shopName={shop.name} />
                ))}
              </div>
              {!items.length && (
                <EmptyState title="No available products">
                  This shop has no currently available products.
                </EmptyState>
              )}
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}
export function ProductPage({ id }: { id: string }) {
  const { t } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const { addToCart, townId, zoneId, locality, areasLoading } = useMarket();
  const productId = Number(id);
  const valid = Number.isSafeInteger(productId) && productId > 0;
  const query = trpc.marketplace.product.useQuery(
    {
      productId: valid ? productId : -1,
      townId: townId ?? -1,
      zoneId: zoneId ?? -1,
    },
    { enabled: valid && Boolean(townId && zoneId) }
  );
  const product = query.data && toMarketProduct(query.data, undefined);
  if (!valid || (query.error && query.error.data?.code === "NOT_FOUND"))
    return <NotAvailable title="That product is unavailable or not listed" />;
  return (
    <div className="product-detail-page">
      <QueryState
        loading={areasLoading || query.isLoading}
        error={
          query.error ||
          (!areasLoading && !townId
            ? new Error("Choose an active town to view this product")
            : undefined)
        }
      >
        {query.data && product && (
          <>
            <Link href={`/shop/${query.data.shop.id}`} className="back-link">
              <ArrowLeft /> Back to {query.data.shop.name}
            </Link>
            <div className="product-detail">
              <div className="product-detail-image">
                <img
                  onError={imageFallback}
                  src={product.image}
                  alt={product.name}
                />
                {product.isDemo && (
                  <span className="demo-sticker">Fictional demo listing</span>
                )}
              </div>
              <div className="product-detail-copy">
                <span className="eyebrow">{query.data.shop.locality}</span>
                <h1>{product.name}</h1>
                <p className="detail-shopline">
                  <Store /> Sold by{" "}
                  <Link href={`/shop/${query.data.shop.id}`}>
                    {query.data.shop.name}
                  </Link>
                </p>
                <div className="detail-price">
                  {formatINR(product.pricePaise)}
                  {product.offer?.referencePricePaise || product.mrpPaise ? (
                    <del>
                      {formatINR(
                        product.offer?.referencePricePaise || product.mrpPaise!
                      )}
                    </del>
                  ) : null}
                  <small>per {product.unit}</small>
                </div>
                {product.offer && (
                  <p className="detail-active-offer">
                    <strong>{product.offer.title}</strong> · Ends{" "}
                    {new Date(product.offer.endsAt).toLocaleString("en-IN")}
                    {product.offer.maxPerOrder
                      ? " · Maximum " +
                        product.offer.maxPerOrder +
                        " units per order"
                      : ""}
                  </p>
                )}
                <p className="detail-description">
                  {product.note || "Details are provided by the listed shop."}
                </p>
                <p>
                  {product.inStock && product.availability === "available"
                    ? t("In stock")
                    : t("Out of stock")}{" "}
                  · {product.availability}
                  {!query.data.shop.isOpen ? " · shop currently closed" : ""}
                </p>
                <div className="detail-unit">
                  <span>Quantity</span>
                  <div className="quantity-control">
                    <button
                      onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                    >
                      <Minus />
                    </button>
                    <strong>{quantity}</strong>
                    <button
                      disabled={quantity >= (product.offer?.maxPerOrder || 100)}
                      onClick={() =>
                        setQuantity(q =>
                          Math.min(product.offer?.maxPerOrder || 100, q + 1)
                        )
                      }
                      aria-label="Increase quantity"
                    >
                      <Plus />
                    </button>
                  </div>
                  <small>{product.unit}</small>
                </div>
                <Button
                  size="lg"
                  className="detail-add"
                  disabled={
                    !product.inStock ||
                    product.availability !== "available" ||
                    !query.data.shop.isOpen
                  }
                  onClick={() => addToCart(product, quantity)}
                >
                  <ShoppingBag /> Add to cart ·{" "}
                  {formatINR(product.pricePaise * quantity)}
                </Button>
                <div className="single-shop-hint">
                  One shop per order. Inventory is checked again by the server
                  at checkout.
                </div>
              </div>
            </div>
          </>
        )}
      </QueryState>
    </div>
  );
}
function NotAvailable({ title }: { title: string }) {
  const { t } = useLanguage();
  return (
    <div className="page-wrap">
      <div className="no-results">
        <Store />
        <h2>{t(title)}</h2>
        <Link href="/search" className="text-link">
          {t("Explore local shops")} <ArrowRight />
        </Link>
      </div>
    </div>
  );
}
