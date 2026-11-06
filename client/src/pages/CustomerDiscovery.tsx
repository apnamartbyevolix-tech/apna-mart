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
  return (
    <div className="discover-section-heading">
      <div>
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {href && (
        <Link href={href}>
          See all <ArrowRight size={15} />
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
      refetchInterval: 30000,
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
          <h1>
            {festival ? (
              <>
                {festival} finds.
                <br />
                <em>Local little delights.</em>
              </>
            ) : (
              <>
                Your town.
                <br />
                <em>In your pocket.</em>
              </>
            )}
          </h1>
          <p>
            {offers.length
              ? "Fresh offers from the shops you know."
              : "Everyday essentials, familiar shops and prices you know."}
          </p>
          <Link
            className="discover-hero-button"
            href={offers.length ? "/offers" : "/categories"}
          >
            {offers.length ? "Explore local offers" : "Find what you need"}
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="grocery-illustration" aria-hidden="true">
          <span className="grocery-sun" />
          <span className="grocery-bag">
            <ShoppingBag />
            <b>
              my
              <br />
              town.
            </b>
          </span>
          <span className="grocery-apple">
            <Apple />
          </span>
          <span className="grocery-milk">
            <Milk />
          </span>
          <span className="grocery-leaf">✦</span>
        </div>
      </section>
      <div className="discover-promises">
        <span>
          <Store size={14} />
          Your local shops
        </span>
        <span>
          <BadgePercent size={14} />
          Shop prices & offers
        </span>
        <span>
          <Package size={14} />
          Delivery or pickup
        </span>
      </div>
      {!d.zoneId ? (
        <ChooseArea />
      ) : (
        <QueryState loading={d.q.isLoading} error={d.q.error}>
          <section>
            <Header
              title="What’s on your list?"
              subtitle="Find it by category"
              href="/categories"
            />
            <CategoryTiles categories={d.q.data?.categories || []} />
          </section>
          <section>
            <Header
              title="Today’s offers"
              subtitle="Real savings from shops around you"
              href="/offers"
            />
            {offers.length ? (
              <ProductShelf products={offers.slice(0, 8)} />
            ) : (
              <Link href="/search" className="offer-empty">
                <BadgePercent />
                <span>
                  <strong>Good finds are just around the corner</strong>
                  <small>
                    Browse your local shops. New offers will appear here when
                    they go live.
                  </small>
                </span>
                <ArrowRight />
              </Link>
            )}
          </section>
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
              title="Everyday, sorted."
              subtitle="Products available in your selected area"
              href="/search"
            />
            <ProductShelf
              products={d.products.filter(p => p.inStock).slice(0, 12)}
            />
          </section>
          <section>
            <Header
              title="The shops you know"
              subtitle="A whole neighbourhood, one place"
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
                      {s.pickupEnabled ? "Pickup available" : "Local delivery"}
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
              {f === "All" ? "All offers" : f}
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
            <option value="saving">Highest saving %</option>
            <option value="price">Price: low to high</option>
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
  const area = useMarket(),
    search = useSearch(),
    params = new URLSearchParams(search),
    text = params.get("q") || "",
    [sort, setSort] = useState("relevant"),
    [onlyStock, setOnlyStock] = useState(true),
    [kind, setKind] = useState(
      params.get("view") === "shops" ? "shops" : "products"
    );
  const q = trpc.marketplace.search.useQuery(
    {
      q: text || undefined,
      townId: area.townId || -1,
      zoneId: area.zoneId || -1,
    },
    { enabled: !!(area.townId && area.zoneId), staleTime: 5000 }
  );
  const shops = (q.data?.shops || []).map(toMarketShop);
  const products = (q.data?.products || [])
    .map(p => ({
      ...toMarketProduct(p),
      shopName:
        (p as any).shopName || shops.find(s => s.id === p.vendorId)?.name,
    }))
    .filter(p => !onlyStock || p.inStock)
    .sort((a, b) =>
      sort === "low"
        ? a.pricePaise - b.pricePaise
        : sort === "high"
          ? b.pricePaise - a.pricePaise
          : 0
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
            Products
          </button>
          <button
            className={kind === "shops" ? "selected" : ""}
            onClick={() => setKind("shops")}
          >
            Shops
          </button>
        </div>
        <select
          aria-label="Sort products"
          value={sort}
          onChange={e => setSort(e.target.value)}
        >
          <option value="relevant">Relevance</option>
          <option value="low">Price: low to high</option>
          <option value="high">Price: high to low</option>
        </select>
      </div>
      <label className="discover-stock-filter">
        <input
          type="checkbox"
          checked={onlyStock}
          onChange={e => setOnlyStock(e.target.checked)}
        />
        In stock only
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
        </QueryState>
      )}
    </div>
  );
}
