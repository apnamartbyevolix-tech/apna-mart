import { useLanguage } from "@/contexts/LanguageContext";
import { useMemo, useState } from "react";
import { Link, useSearch } from "wouter";
import {
  Apple,
  ArrowRight,
  BadgePercent,
  Carrot,
  Coffee,
  CookingPot,
  Grid2X2,
  MapPin,
  Milk,
  NotebookPen,
  Package,
  Search,
  Shirt,
  ShoppingBag,
  Sparkles,
  Store,
  Wheat,
  Wrench,
} from "lucide-react";
import { useMarket } from "@/components/MarketChrome";
import {
  ProductCard,
  QueryState,
  EmptyState,
  ShopCard,
} from "@/components/MarketCards";
import { trpc } from "@/lib/trpc";
import {
  toMarketProduct,
  toMarketShop,
  type MarketProduct,
} from "@/lib/marketplace";
import "./customer-discovery.css";

const icons: Record<string, typeof Store> = {
  grocery: ShoppingBag,
  vegetables: Carrot,
  "dairy-bakery": Milk,
  stationery: NotebookPen,
  fruits: Apple,
  hardware: Wrench,
  "personal-care": Sparkles,
  household: CookingPot,
  clothing: Shirt,
  snacks: Coffee,
  "atta-rice-oil-dals": Wheat,
};
function CategoryTiles({
  categories,
  all = false,
}: {
  categories: any[];
  all?: boolean;
}) {
  return (
    <div className={"discover-categories " + (all ? "all-categories" : "")}>
      {categories.slice(0, all ? categories.length : 8).map((c, i) => {
        const Icon = icons[c.slug] || Package;
        return (
          <Link
            className="discover-category"
            key={c.id}
            href={"/category/" + c.slug}
          >
            <span className={"category-picture tone-" + (i % 6)}>
              <Icon strokeWidth={1.5} />
              <i />
            </span>
            <strong>{c.name}</strong>
          </Link>
        );
      })}
    </div>
  );
}
function Header({
  title,
  subtitle,
  href,
}: {
  title: string;
  subtitle?: string;
  href?: string;
}) {
  const { t } = useLanguage();
  return (
    <div className="discover-section-heading">
      <div>
        <h2>{t(title)}</h2>
        {subtitle && <p>{t(subtitle)}</p>}
      </div>
      {href && (
        <Link href={href}>
          {t("See all")} <ArrowRight size={15} />
        </Link>
      )}
    </div>
  );
}
function useDiscovery() {
  const area = useMarket();
  const q = trpc.marketplace.home.useQuery(
    { townId: area.townId || -1, zoneId: area.zoneId || -1 },
    {
      enabled: !!(area.townId && area.zoneId),
      staleTime: 10000,
      refetchInterval: false,
      retry: false,
      refetchIntervalInBackground: false,
    }
  );
  const shops = useMemo(
    () => (q.data?.shops || []).map(toMarketShop),
    [q.data]
  );
  const products = useMemo(
    () =>
      (q.data?.products || []).map(p => ({
        ...toMarketProduct(p),
        shopName: shops.find(s => s.id === p.vendorId)?.name,
      })),
    [q.data, shops]
  );
  return { ...area, q, shops, products };
}
function ChooseArea() {
  return (
    <EmptyState icon={MapPin} title="Find the good things around you">
      <span>
        Choose your town and service area above to see local products, shops and
        offers.
      </span>
    </EmptyState>
  );
}
function ProductShelf({ products }: { products: MarketProduct[] }) {
  return (
    <div className="discover-product-grid">
      {products.map(p => (
        <ProductCard key={p.id} product={p} shopName={p.shopName} />
      ))}
    </div>
  );
}

export default function CustomerHome() {
  const { t } = useLanguage();
  const d = useDiscovery();
  const offers = d.products.filter(p => p.offer && p.inStock),
    festival = offers.find(p => p.offer?.festival)?.offer?.festival;
  return (
    <div className="customer-home">
      <section className={"discover-hero " + (festival ? "festival-hero" : "")}>
        <div>
          <span className="discover-kicker">
            <MapPin size={13} />
            {d.locality || "YOUR NEIGHBOURHOOD, ONLINE"}
          </span>
          <h1>{t("Good finds. Close to home.")}</h1>
          <p>{t("Offers from your local shops")}</p>
          <Link
            className="discover-hero-button"
            href={offers.length ? "/offers" : "/categories"}
          >
            {offers.length ? t("Explore offers") : t("Explore categories")}
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="mart-hero-art" aria-hidden="true">
          <Store />
        </div>
      </section>
      <div className="discover-promises">
        <span>
          <Store size={14} />
          {t("Your local shops")}{" "}
        </span>
        <span>
          <BadgePercent size={14} />
          {t("Shop prices & offers")}{" "}
        </span>
        <span>
          <Package size={14} />
          {t("Delivery or pickup")}{" "}
        </span>
      </div>
      {!d.zoneId ? (
        <ChooseArea />
      ) : (
        <QueryState loading={d.q.isLoading} error={d.q.error}>
          <section>
            <Header
              title={t("What’s on your list?")}
              subtitle={t("Find it by category")}
              href="/categories"
            />
            <CategoryTiles categories={d.q.data?.categories || []} />
          </section>
          {offers.length > 0 && (
            <section>
              <Header
                title={t("Today’s offers")}
                subtitle={t("Real savings from shops around you")}
                href="/offers"
              />
              <ProductShelf products={offers.slice(0, 8)} />
            </section>
          )}
          {festival && (
            <Link
              href={"/offers?festival=" + encodeURIComponent(festival)}
              className="discover-festival"
            >
              <span className="festival-icon">
                <Sparkles size={32} />
              </span>
              <div>
                <small>FESTIVAL PICKS FROM YOUR TOWN</small>
                <h2>{festival} specials</h2>
                <p>Discover what your local shopkeepers have in store.</p>
              </div>
              <ArrowRight />
            </Link>
          )}
          <section>
            <Header
              title={t("Everyday, sorted.")}
              subtitle={t("Products available in your selected area")}
              href="/search"
            />
            <ProductShelf
              products={d.products.filter(p => p.inStock).slice(0, 12)}
            />
          </section>
          <section>
            <Header
              title={t("The shops you know")}
              subtitle={t("A whole neighbourhood, one place")}
              href="/search?view=shops"
            />
            <div className="discover-shop-list">
              {d.shops.map(s => (
                <Link key={s.id} href={"/shop/" + s.id}>
                  <span className="discover-shop-logo">
                    {s.name.replace(/^DEMO\s*[—-]\s*/, "").slice(0, 1)}
                  </span>
                  <div>
                    <strong>{s.name}</strong>
                    <small>
                      {s.categoryLabel} · {s.locality}
                    </small>
                    <span>
                      {s.pickupEnabled
                        ? t("Pickup available")
                        : "Local delivery"}
                      {s.deliveryEnabled ? " · Delivery available" : ""}
                    </span>
                  </div>
                  <ArrowRight size={19} />
                </Link>
              ))}
            </div>
          </section>
        </QueryState>
      )}
    </div>
  );
}
export function CategoriesPage() {
  const d = useDiscovery();
  return (
    <div className="discovery-page">
      <div className="discover-page-title">
        <small>YOUR LOCAL MARKET</small>
        <h1>A little bit of everything.</h1>
        <p>Find what you need, from the shops around you.</p>
      </div>
      {!d.zoneId ? (
        <ChooseArea />
      ) : (
        <QueryState loading={d.q.isLoading} error={d.q.error}>
          <CategoryTiles categories={d.q.data?.categories || []} all />
        </QueryState>
      )}
    </div>
  );
}
export function OffersPage() {
  const { t } = useLanguage();
  const d = useDiscovery(),
    params = new URLSearchParams(useSearch()),
    [selected, setSelected] = useState(params.get("festival") || "All"),
    [sort, setSort] = useState("saving");
  const offers = d.products.filter(p => p.offer && p.inStock),
    festivals = Array.from(
      new Set(offers.map(p => p.offer?.festival).filter(Boolean))
    ) as string[];
  const filtered = offers
    .filter(p => selected === "All" || p.offer?.festival === selected)
    .sort((a, b) =>
      sort === "price"
        ? a.pricePaise - b.pricePaise
        : (b.offer!.referencePricePaise - b.pricePaise) /
            b.offer!.referencePricePaise -
          (a.offer!.referencePricePaise - a.pricePaise) /
            a.offer!.referencePricePaise
    );
  return (
    <div className="discovery-page">
      <div className="discover-page-title">
        <small>GOOD THINGS, BETTER PRICES</small>
        <h1>Offers around your corner.</h1>
        <p>
          Discover genuine shopkeeper offers. Check the dates, pack size and
          offer limits.
        </p>
      </div>
      <div className="discover-filter-row">
        <div>
          {["All", ...festivals].map(f => (
            <button
              className={selected === f ? "selected" : ""}
              key={f}
              onClick={() => setSelected(f)}
            >
              {f === "All" ? t("All offers") : f}
            </button>
          ))}
        </div>
        <label>
          <span className="sr-only">Sort offers</span>
          <select
            aria-label="Sort offers"
            value={sort}
            onChange={e => setSort(e.target.value)}
          >
            <option value="saving">{t("Highest saving %")}</option>
            <option value="price">{t("Price: low to high")}</option>
          </select>
        </label>
      </div>
      {!d.zoneId ? (
        <ChooseArea />
      ) : (
        <QueryState loading={d.q.isLoading} error={d.q.error}>
          {filtered.length ? (
            <ProductShelf products={filtered} />
          ) : (
            <EmptyState icon={BadgePercent} title="New offers are on their way">
              There are no active offers for this selection. Browse the
              categories or check again later.
            </EmptyState>
          )}
        </QueryState>
      )}
    </div>
  );
}
export function CustomerSearchPage() {
  const { t } = useLanguage();
  const area = useMarket(),
    search = useSearch(),
    params = new URLSearchParams(search),
    text = params.get("q") || "",
    [sort, setSort] = useState("relevant"),
    [onlyStock, setOnlyStock] = useState(true),
    [kind, setKind] = useState(
      params.get("view") === "shops" ? "shops" : "products"
    );
  const q = trpc.marketplace.browse.useInfiniteQuery(
    {
      q: text || undefined,
      townId: area.townId || -1,
      zoneId: area.zoneId || -1,
      kind: kind === "shops" ? "shops" : "products",
      onlyStock,
      sort: sort === "low" || sort === "high" ? sort : "relevant",
    },
    {
      enabled: !!(area.townId && area.zoneId),
      retry: false,
      getNextPageParam: page => page.nextCursor ?? undefined,
    }
  );
  const shops = (q.data?.pages.flatMap(page => page.shops) || []).map(
    toMarketShop
  );
  const products = (q.data?.pages.flatMap(page => page.products) || []).map(
    product => ({ ...toMarketProduct(product), shopName: product.shopName })
  );
  return (
    <div className="discovery-page">
      <div className="discover-page-title">
        <small>FIND IT IN YOUR TOWN</small>
        <h1>{text ? <>Results for “{text}”</> : "Your next local find."}</h1>
        <p>
          Search products, brands and shops in{" "}
          {area.locality || "your selected area"}.
        </p>
      </div>
      <div className="discover-filter-row">
        <div>
          <button
            className={kind === "products" ? "selected" : ""}
            onClick={() => setKind("products")}
          >
            {t("Products")}{" "}
          </button>
          <button
            className={kind === "shops" ? "selected" : ""}
            onClick={() => setKind("shops")}
          >
            {t("Shops")}{" "}
          </button>
        </div>
        <select
          aria-label="Sort products"
          value={sort}
          onChange={e => setSort(e.target.value)}
        >
          <option value="relevant">{t("Relevance")}</option>
          <option value="low">{t("Price: low to high")}</option>
          <option value="high">{t("Price: high to low")}</option>
        </select>
      </div>
      <label className="discover-stock-filter">
        <input
          type="checkbox"
          checked={onlyStock}
          onChange={e => setOnlyStock(e.target.checked)}
        />
        {t("In stock only")}{" "}
      </label>
      {!area.zoneId ? (
        <ChooseArea />
      ) : (
        <QueryState loading={q.isLoading} error={q.error}>
          {kind === "products" ? (
            products.length ? (
              <ProductShelf products={products} />
            ) : (
              <EmptyState icon={Search} title="Let’s try another search">
                Try a product name, brand or a different category.
              </EmptyState>
            )
          ) : (
            <div className="shop-grid">
              {shops.map(s => (
                <ShopCard key={s.id} shop={s} />
              ))}
            </div>
          )}
          {q.hasNextPage && (
            <button
              className="mart-load-more"
              disabled={q.isFetchingNextPage}
              onClick={() => void q.fetchNextPage()}
            >
              {t(q.isFetchingNextPage ? "Loading…" : "Load more")}
            </button>
          )}
          {q.isFetchNextPageError && (
            <p role="status">
              {t("Could not load more items. Please try again.")}
            </p>
          )}
        </QueryState>
      )}
    </div>
  );
}
