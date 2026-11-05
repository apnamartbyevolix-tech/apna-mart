import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowRight, Clock3, MapPin, Plus, Star, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMarket } from "@/components/MarketChrome";
import {
  imageFallback,
  formatINR,
  type MarketProduct,
  type MarketShop,
} from "@/lib/marketplace";

export function SectionHeading({
  eyebrow,
  title,
  href,
  action = "See all",
}: {
  eyebrow?: string;
  title: string;
  href?: string;
  action?: string;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {href && (
        <Link href={href} className="text-link">
          {action}
          <ArrowRight className="size-4" />
        </Link>
      )}
    </div>
  );
}
export function ProductCard({
  product,
  shopName,
}: {
  product: MarketProduct;
  shopName?: string;
}) {
  const { addToCart } = useMarket();
  const available = product.inStock && product.availability === "available";
  return (
    <article className="product-card">
      <Link href={`/product/${product.id}`} className="product-image-wrap">
        <img onError={imageFallback} loading="lazy" src={product.image} alt={product.name} />
        {product.isDemo && <span className="demo-sticker">Fictional demo</span>}
      </Link>
      <div className="product-card-body">
        <Link href={`/product/${product.id}`} className="product-title">
          {product.name}
        </Link>
        <p className="product-unit">
          {product.unit} · {available ? "In stock" : "Out of stock"}
        </p>
        <div className="product-buy">
          <div>
            <strong>{formatINR(product.pricePaise)}</strong>
            {product.mrpPaise && <del>{formatINR(product.mrpPaise)}</del>}
          </div>
          <Button
            size="icon"
            className="add-button"
            aria-label={`Add ${product.name} to cart`}
            disabled={!available}
            onClick={() => addToCart(product)}
          >
            <Plus />
          </Button>
        </div>
        <Link href={`/shop/${product.shopId}`} className="product-shop">
          {shopName || "View shop"}
        </Link>
      </div>
    </article>
  );
}
export function ShopCard({ shop }: { shop: MarketShop }) {
  return (
    <Link href={`/shop/${shop.id}`} className="shop-card">
      <div className="shop-cover">
        <img onError={imageFallback} loading="lazy" src={shop.image} alt="" />
        {shop.isDemo && <span className="demo-sticker">Fictional demo</span>}
        <span className="open-pill">
          <span />
          {shop.isOpen ? "Open" : "Closed"}
        </span>
      </div>
      <div className="shop-card-copy">
        <div className="shop-title-row">
          <div>
            <h3>{shop.name}</h3>
            <p>{shop.categoryLabel}</p>
            {shop.ratingCount > 0 && <small className="shop-rating"><Star className="size-3" fill="currentColor" /> {shop.ratingAverage?.toFixed(1)} · {shop.ratingCount} reviews</small>}
          </div>
          <span className="shop-arrow">
            <ArrowRight />
          </span>
        </div>
        <div className="shop-meta">
          <span>
            <Clock3 />
            {shop.eta}
          </span>
          <span>
            <MapPin />
            {shop.locality}
          </span>
        </div>
        <p className="shop-delivery">
          {shop.deliveryEnabled
            ? `Delivery ${formatINR(shop.deliveryFeePaise)}`
            : "Pickup only"}{" "}
          · minimum {formatINR(shop.minimumPaise)}
        </p>
      </div>
    </Link>
  );
}
export function EmptyState({
  icon: Icon = Store,
  title,
  children,
}: {
  icon?: typeof Store;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function IntegrationNote({
  title = "Not connected yet",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="integration-note">
      <span className="integration-mark">i</span>
      <div>
        <strong>{title}</strong>
        <p>{children}</p>
      </div>
    </div>
  );
}
export function QueryState({
  loading,
  error,
  empty,
  children,
}: {
  loading: boolean;
  error?: unknown;
  empty?: boolean;
  children?: ReactNode;
}) {
  if (loading)
    return (
      <div className="loading-card">
        <span className="loading-spinner" />
        Loading live marketplace records…
      </div>
    );
  if (error)
    return (
      <div className="no-results">
        <Store />
        <h2>Marketplace data couldn't be loaded</h2>
        <p>{error instanceof Error ? error.message : "Please try again."}</p>
      </div>
    );
  if (empty)
    return (
      <EmptyState title="Nothing listed here yet">
        No matching records are currently available from the marketplace.
      </EmptyState>
    );
  return <>{children}</>;
}
