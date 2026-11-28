import { CatalogueMore, useCatalogue, useOfferBoundary } from "@/components/CataloguePage";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useMemo, useState } from "react";
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
  const { t } = useLanguage();
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
            <strong>{t(c.name)}</strong>
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
  useOfferBoundary(products, q.refetch);
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
  const preferenceKey = 'mart-personalization:' + (d.auth.user?.id || 'guest');
  const [preference,setPreference]=useState<{key:string;enabled:boolean}>(()=>{try{return {key:preferenceKey,enabled:localStorage.getItem(preferenceKey)!=='off'};}catch{return {key:preferenceKey,enabled:true};}});
  const personalized=preference.key===preferenceKey&&preference.enabled;
  useEffect(()=>{try{setPreference({key:preferenceKey,enabled:localStorage.getItem(preferenceKey)!=='off'});}catch{setPreference({key:preferenceKey,enabled:true});}},[preferenceKey]);
  const recommendations=trpc.marketplace.recommendations.useQuery({townId:d.townId||-1,zoneId:d.zoneId||-1},{enabled:!!d.auth.user&&!!d.townId&&!!d.zoneId&&personalized,retry:false,refetchOnMount:'always',staleTime:0});
  const buyAgain=personalized&&recommendations.data&&recommendations.data.userId===d.auth.user?.id ? recommendations.data.products.map(p=>({...toMarketProduct(p),shopName:d.shops.find(s=>s.id===p.vendorId)?.name})) : [];
  const previousCategories=new Set(buyAgain.map(p=>p.categoryId));
  const boughtIds=new Set(buyAgain.map(p=>p.id));
  const forYou=personalized?d.products.filter(p=>p.inStock&&previousCategories.has(p.categoryId)&&!boughtIds.has(p.id)).slice(0,8):[];
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
          {d.auth.user&&<section className="personal-shopping-settings"><label><input type="checkbox" checked={personalized} onChange={event=>{const enabled=event.target.checked;setPreference({key:preferenceKey,enabled});try{localStorage.setItem(preferenceKey,enabled?'on':'off');}catch{}}}/>Personal shopping suggestions on this device</label><p>Based only on your completed orders. Prices and availability are checked again at checkout.</p></section>}
          {buyAgain.length>0&&<section><Header title="Buy again" subtitle="From your own completed orders"/><ProductShelf products={buyAgain.slice(0,8)}/></section>}
          {forYou.length>0&&<section><Header title="More for your everyday list" subtitle="Available products in categories you have bought"/><ProductShelf products={forYou}/></section>}
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
  const area = useMarket();
  const [festival, setFestival] = useState(new URLSearchParams(useSearch()).get("festival") || "");
  const [filter, setFilter] = useState(festival);
  const [sort, setSort] = useState<"relevant" | "low">("relevant");
  const query = useCatalogue({ townId: area.townId || -1, zoneId: area.zoneId || -1, offersOnly: true, festival: filter || undefined, sort });
  const products = query.products.map(product => ({ ...toMarketProduct(product), shopName: product.shopName }));
  return <div className="discovery-page">
    <div className="discover-page-title"><small>{t("OFFERS FROM LOCAL SHOPS")}</small><h1>{t("Offers around your corner.")}</h1><p>{t("Check the dates, pack size and offer limits before ordering.")}</p></div>
    <form className="discover-filter-row" onSubmit={event => { event.preventDefault(); setFilter(festival.trim()); }}>
      <label>{t("Festival or occasion")}<input maxLength={80} value={festival} onChange={event => setFestival(event.target.value)} placeholder={t("Search offers by occasion")} /></label>
      <button type="submit" className="mart-load-more">{t("Apply")}</button>
      <select aria-label={t("Sort offers")} value={sort} onChange={event => setSort(event.target.value as "relevant" | "low")}><option value="relevant">{t("Default order")}</option><option value="low">{t("Price: low to high")}</option></select>
    </form>
    {!area.zoneId ? <ChooseArea /> : <QueryState loading={query.isLoading} error={query.error}>
      {products.length ? <ProductShelf products={products} /> : <EmptyState icon={BadgePercent} title="No active offers for this selection"><span>{t("Try another occasion or browse all products.")}</span><Link href="/search">{t("Browse products")}</Link></EmptyState>}
      <CatalogueMore query={query} />
    </QueryState>}
  </div>;
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
  const q = useCatalogue({ q: text || undefined, townId: area.townId || -1, zoneId: area.zoneId || -1, kind: kind === "shops" ? "shops" : "products", onlyStock, sort: sort === "low" || sort === "high" ? sort : "relevant" });
  const shops = q.shops.map(toMarketShop);
  const products = q.products.map(product => ({ ...toMarketProduct(product), shopName: product.shopName }));
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
          <CatalogueMore query={q} />
        </QueryState>
      )}
    </div>
  );
}
