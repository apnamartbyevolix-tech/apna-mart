import { CustomerPushSettings } from "@/components/CustomerNotifications";
import { CatalogueMore } from "@/components/CataloguePage";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useMemo, useState } from "react";
import MobileSignIn from "./MobileSignIn";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Heart,
  MessageSquareText,
  MapPin,
  Minus,
  Plus,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  IntegrationNote,
  QueryState,
  ShopCard,
} from "@/components/MarketCards";
import { LoginButton, useMarket } from "@/components/MarketChrome";
import {
  imageFallback,
  formatINR,
  toMarketProduct,
  toMarketShop,
} from "@/lib/marketplace";
import { trpc } from "@/lib/trpc";

export { CheckoutPage } from "./CheckoutPage";

export function CartPage() {
  const { t } = useLanguage();
  const { cart, setQuantity, clearCart, townId, zoneId, locality } =
    useMarket();
  const shopId = cart[0]?.product.shopId;
  const shopQuery = trpc.marketplace.shop.useQuery(
    {
      shopId: shopId ?? -1,
      townId: townId ?? -1,
      zoneId: zoneId ?? -1,
    },
    { enabled: Boolean(shopId && townId && zoneId) }
  );
  const shop = shopQuery.data;
  const subtotal = cart.reduce(
    (sum, line) => sum + line.product.pricePaise * line.quantity,
    0
  );
  if (!cart.length)
    return (
      <div className="page-wrap">
        <Link href="/" className="back-link">
          <ArrowLeft /> {t("Keep browsing")}{" "}
        </Link>
        <EmptyState icon={ShoppingBag} title={t("Your cart is empty")}>
          Browse current marketplace listings and add available products from
          one seller.
        </EmptyState>
        <div className="center-action">
          <Link href="/search" className="primary-link">
            {t("Explore local shops")} <ArrowRight />
          </Link>
        </div>
      </div>
    );
  if (shopQuery.isLoading)
    return (
      <div className="page-wrap">
        <QueryState loading />
      </div>
    );
  return (
    <div className="page-wrap cart-page">
      <Link href="/search" className="back-link">
        <ArrowLeft /> Keep exploring
      </Link>
      <div className="page-intro">
        <p className="eyebrow">ONE LOCAL SELLER PER ORDER</p>
        <h1>{t("Your cart")}</h1>
        <p>
          Items and availability are revalidated by the server when the order is
          placed.
        </p>
      </div>
      {(!shop || shopQuery.error) && (
        <div role="alert" className="integration-note">
          <div>
            <strong>
              {shopQuery.error?.message ||
                "This shop is unavailable in your selected locality."}
            </strong>
            <p>
              Choose the original service area above, remove items below, or
              clear this cart. Your items have not been replaced.
            </p>
            <Button variant="outline" onClick={clearCart}>
              {t("Clear cart")}{" "}
            </Button>
          </div>
        </div>
      )}
      <div className="cart-layout">
        <section className="cart-items">
          <div className="cart-shop-label">
            <span className="nearby-logo">
              <Store />
            </span>
            <div>
              <strong>{shop?.shopName ?? "Saved shop"}</strong>
              <small>
                {shop?.isDemo ? "Fictional demo shop" : "Marketplace shop"} ·{" "}
                {shop?.locality}
              </small>
            </div>
            <Link href={`/shop/${shopId}`} className="text-link">
              {t("Shop page")} <ArrowRight />
            </Link>
          </div>
          {cart.map(({ product, quantity }) => (
            <article className="cart-line" key={product.id}>
              <img onError={imageFallback} src={product.image} alt="" />
              <div className="cart-line-info">
                <Link href={`/product/${product.id}`}>{product.name}</Link>
                <small>
                  {product.unit} · saved price · checked at checkout
                </small>
                <strong>{formatINR(product.pricePaise * quantity)}</strong>
              </div>
              <div className="cart-line-actions">
                <div className="quantity-control compact">
                  <button
                    aria-label={t("Remove one")}
                    onClick={() => setQuantity(product.id, quantity - 1)}
                  >
                    <Minus />
                  </button>
                  <strong>{quantity}</strong>
                  <button
                    aria-label={t("Add one")}
                    disabled={quantity >= 100}
                    onClick={() => setQuantity(product.id, quantity + 1)}
                  >
                    <Plus />
                  </button>
                </div>
                <button
                  className="remove-link"
                  onClick={() => setQuantity(product.id, 0)}
                >
                  <Trash2 /> {t("Remove")}{" "}
                </button>
              </div>
            </article>
          ))}
          <div className="single-shop-hint">
            <Check /> One shop per order. Availability is checked again at
            checkout.
          </div>
        </section>
        <aside className="cart-summary">
          <h2>{t("Estimate")}</h2>
          <div>
            <span>{t("Items subtotal")}</span>
            <strong>{formatINR(subtotal)}</strong>
          </div>
          <div>
            <span>{t("Delivery (if selected)")}</span>
            <strong>
              {shop?.deliveryEnabled
                ? formatINR(shop?.deliveryFeePaise ?? 0)
                : "Not available"}
            </strong>
          </div>
          <p className="summary-small">
            Final fees and total are calculated by the server. Minimum order{" "}
            {formatINR(shop?.minimumOrderPaise ?? 0)}.
          </p>
          <Button
            size="lg"
            disabled={!shop || !townId || !zoneId}
            onClick={() => window.location.assign("/checkout")}
          >
            {t("Continue to checkout")} <ArrowRight />
          </Button>
        </aside>
      </div>
    </div>
  );
}

export function OrdersPage() {
  const { t } = useLanguage();
  const { auth } = useMarket();
  const query = trpc.marketplace.orderHistory.useInfiniteQuery({}, {
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
    enabled: Boolean(auth.user),
    retry: false,
  });
  const rows = query.data?.pages.flatMap(page => page.orders) || [];
  if (auth.loading)
    return (
      <div className="page-wrap">
        <div className="loading-card">
          <span className="loading-spinner" />
          Checking your secure sign-in…
        </div>
      </div>
    );
  if (auth.error)
    return (
      <div className="page-wrap">
        <EmptyState icon={CircleHelp} title="Couldn't check your account">
          Please try again. Orders stay private to the signed-in customer.
        </EmptyState>
        <Button onClick={() => auth.refresh()}>{t("Try again")}</Button>
      </div>
    );
  if (!auth.user)
    return (
      <div className="page-wrap">
        <div className="account-hero">
          <span className="account-avatar">
            <UserRound />
          </span>
          <p className="eyebrow">YOUR APNA MART ACCOUNT</p>
          <h1>Sign in to see your orders.</h1>
          <p>Sign in with your mobile number and PIN.</p>
          <LoginButton>{t("Sign in")}</LoginButton>
        </div>
        <OtpNote />
      </div>
    );
  return (
    <div className="page-wrap">
      <div className="page-intro">
        <p className="eyebrow">YOUR LOCAL SHOPPING</p>
        <h1>{t("Orders")}</h1>
        <p>Track your orders and view past purchases.</p>
      </div>
      <QueryState loading={query.isLoading} error={query.error}>
        {query.data &&
          (rows.length ? (
            <div className="order-list">
              {rows.map(({ order, shopName }) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="workspace-panel order-row"
                >
                  <div>
                    <strong>{order.orderNumber}</strong>
                    <p>
                      {shopName} · {new Date(order.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span>{order.status.replaceAll("_", " ")}</span>
                  <strong>{formatINR(order.totalPaise)}</strong>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon={ShoppingBag} title={t("No orders yet")}>
              Your submitted marketplace orders will appear here.
            </EmptyState>
          ))}
        <CatalogueMore query={query} />
      </QueryState>
      <IntegrationNote title="Order updates">
        {t("Open an order for its latest status, collection code and help options.")}
      </IntegrationNote>
    </div>
  );
}

export function OrderDetailPage({ id }: { id: string }) {
  const { t } = useLanguage();
  const { auth, cart, replaceCart, townId, zoneId, locality } = useMarket();
  const [, navigate] = useLocation();
  const orderId = Number(id);
  const valid = Number.isSafeInteger(orderId) && orderId > 0;
  const utils = trpc.useUtils();
  const q = trpc.marketplace.orderDetail.useQuery(
    { orderId: valid ? orderId : -1 },
    {
      enabled: Boolean(auth.user && valid),
      retry: false,
      refetchIntervalInBackground: false,
      refetchInterval: query => {
        const status = query.state.data?.order.status;
        return status &&
          !["delivered", "rejected", "cancelled", "failed_delivery"].includes(
            status
          )
          ? 10_000
          : false;
      },
    }
  );
  const [reason, setReason] = useState("");
  const [buyAgainRequested, setBuyAgainRequested] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const cancel = trpc.marketplace.cancelOrder.useMutation({
    onSuccess: async () => {
      toast.success("Order cancelled");
      await Promise.all([utils.marketplace.myOrders.invalidate(), utils.marketplace.orderHistory.invalidate(), q.refetch()]);
    },
    onError: error => toast.error(error.message),
  });
  const reviewOrder = trpc.customer.reviewOrder.useMutation({
    onSuccess: async () => {
      setReviewComment("");
      toast.success("Thank you — your shop review is saved");
      await Promise.all([
        utils.marketplace.orderDetail.invalidate({ orderId }),
        utils.marketplace.shop.invalidate(),
        utils.marketplace.home.invalidate(),
        utils.marketplace.search.invalidate(),
      ]);
    },
    onError: error => toast.error(error.message),
  });
  const data = q.data;
  const buyAgain = trpc.marketplace.browse.useQuery(
    {
      shopId: data?.order.vendorId ?? -1,
      productIds: data?.items.filter(item => item.productId !== null).map(item => item.productId!) || [1],
      limit: 50,
      onlyStock: false,
      townId: townId ?? -1,
      zoneId: zoneId ?? -1,
    },
    {
      enabled: Boolean(
        buyAgainRequested && data?.items.some(item => item.productId !== null) && data?.order.vendorId && townId && zoneId
      ),
    }
  );
  useEffect(() => {
    if (buyAgainRequested && buyAgain.error) {
      setBuyAgainRequested(false);
      toast.error(
        `Current shop listings could not be loaded: ${buyAgain.error.message}`
      );
      return;
    }
    if (buyAgainRequested && data && !data.items.some(item => item.productId !== null)) { setBuyAgainRequested(false); toast.error("No current products remain for this order."); return; }
    if (!buyAgainRequested || !data || !buyAgain.data) return;
    setBuyAgainRequested(false);
    const previousItems = new Map(
      data.items
        .filter(item => item.productId !== null)
        .map(item => [item.productId as number, item.quantity])
    );
    const currentProducts = buyAgain.data.products.map(product =>
      toMarketProduct(product, data.order.vendorId)
    );
    const rebuilt = currentProducts
      .filter(
        product =>
          previousItems.has(product.id) &&
          product.inStock &&
          product.availability === "available"
      )
      .map(product => ({
        product,
        quantity: Math.max(
          1,
          Math.min(100, product.offer?.maxPerOrder || 100, previousItems.get(product.id) ?? 1)
        ),
      }));
    const skipped = data.items
      .filter(
        item =>
          item.productId === null ||
          !rebuilt.some(line => line.product.id === item.productId)
      )
      .map(item => item.productNameSnapshot);
    if (!rebuilt.length) {
      toast.error(
        "None of the products from this order are currently available in the selected town and locality."
      );
      return;
    }
    if (cart.length && !window.confirm("Replace the items currently in your cart with this order’s available products?")) return;
    replaceCart(rebuilt);
    toast.success(
      skipped.length
        ? `Current products added. Skipped: ${skipped.join(", ")}`
        : "Current products and prices added to your cart"
    );
    navigate("/cart");
  }, [
    buyAgainRequested,
    cart,
    buyAgain.data,
    buyAgain.error,
    data,
    replaceCart,
    navigate,
  ]);
  if (!auth.user)
    return (
      <div className="page-wrap">
        <Link href="/orders" className="back-link">
          <ArrowLeft /> {t("Order history")}{" "}
        </Link>
        <div className="account-hero">
          <h1>Sign in to view this order.</h1>
          <p>Order details are private to the signed-in account.</p>
          <LoginButton />
        </div>
      </div>
    );
  if (!valid || q.error?.data?.code === "NOT_FOUND") return <NotFoundOrder />;
  const handoverEligible =
    data &&
    ((data.order.fulfillmentType === "pickup" &&
      data.order.status === "ready") ||
      (data.order.fulfillmentType === "delivery" &&
        data.order.status === "out_for_delivery"));
  return (
    <div className="page-wrap">
      <Link href="/orders" className="back-link">
        <ArrowLeft /> {t("Order history")}{" "}
      </Link>
      <QueryState loading={q.isLoading} error={q.error}>
        {data && (
          <>
            <div className="page-intro">
              <p className="eyebrow">ORDER {data.order.orderNumber}</p>
              <h1>
                {data.apnaSync?.pending
                  ? "Awaiting shop confirmation"
                  : data.order.status.replaceAll("_", " ")}
              </h1>
              {data.apnaSync?.pending && (
                <p role="status">
                  Your order was received. Stock confirmation is pending; please
                  do not place it again.
                </p>
              )}
              <Button
                variant="outline"
                disabled={q.isFetching}
                onClick={() => void q.refetch()}
              >
                {q.isFetching ? "Refreshing…" : "Refresh order"}
              </Button>
              <p>
                {new Date(data.order.createdAt).toLocaleString()} ·{" "}
                {data.order.fulfillmentType === "delivery"
                  ? t("Delivery")
                  : "Pickup"}{" "}
                · payment {data.order.paymentStatus}
              </p>
            </div>
            {handoverEligible && (
              <section className="workspace-panel" aria-live="polite">
                <h2>{t("Your handover code")}</h2>
                {data.handoverCode ? (
                  <>
                    <p
                      className="summary-total"
                      style={{
                        fontSize: "2rem",
                        letterSpacing: ".16em",
                        fontWeight: 700,
                      }}
                    >
                      {data.handoverCode}
                    </p>
                    <p>
                      {t("Show this 8-digit code to")}{" "}
                      {data.order.fulfillmentType === "pickup"
                        ? "the shop when collecting your order"
                        : "the seller or rider when your order arrives"}
                      . This code is visible only in your signed-in order.{" "}
                      <strong>{t("No SMS is sent.")}</strong>
                    </p>
                  </>
                ) : (
                  <p>
                    {data.order.handoverLockedAt
                      ? "This code is temporarily hidden after five invalid attempts. An administrator must verify the customer and reset the lock before another handover attempt. No SMS is sent."
                      : "The handover code is not available for this order state. Refresh this page or contact the shop."}
                  </p>
                )}
              </section>
            )}
            <section className="workspace-panel">
              <h2>{t("Items")}</h2>
              {data.items.map(item => (
                <div className="checkout-item" key={item.id}>
                  <span>
                    {item.quantity} × {item.productNameSnapshot} (
                    {item.unitSnapshot})
                  </span>
                  <strong>{formatINR(item.lineTotalPaise)}</strong>
                </div>
              ))}
              <div className="summary-divider" />
              <div>
                <span>{t("Subtotal")}</span>
                <strong>{formatINR(data.order.subtotalPaise)}</strong>
              </div>
              {data.order.taxPaise > 0 && <div><span>{t("GST included")}</span><strong>{formatINR(data.order.taxPaise)}</strong></div>}
              <div>
                <span>{t("Delivery fee")}</span>
                <strong>{formatINR(data.order.deliveryFeePaise)}</strong>
              </div>
              <div>
                <span>{t("Platform fee")}</span>
                <strong>{formatINR(data.order.platformFeePaise)}</strong>
              </div>
              <div className="summary-total">
                <span>{t("Total")}</span>
                <strong>{formatINR(data.order.totalPaise)}</strong>
              </div>
            </section>
            <section className="workspace-panel">
              <h2>{t("Order status timeline")}</h2>
              <div className="order-timeline">
                {data.timeline.map(event => (
                  <div className="timeline-step" key={event.id}>
                    <span className="timeline-node">
                      <Check />
                    </span>
                    <span>
                      <strong>{event.toStatus.replaceAll("_", " ")}</strong>
                      <small>
                        {new Date(event.createdAt).toLocaleString()}
                        {event.note ? ` · ${event.note}` : ""}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
            {data.order.status === "delivered" && (
              <section className="workspace-panel">
                <h2>{t("Review this shop")}</h2>
                {data.review ? (
                  <p>
                    Your review: {data.review.rating}/5
                    {data.review.comment ? ` · ${data.review.comment}` : ""}
                  </p>
                ) : (
                  <form
                    className="application-form"
                    onSubmit={event => {
                      event.preventDefault();
                      reviewOrder.mutate({
                        orderId,
                        rating,
                        ...(reviewComment.trim()
                          ? { comment: reviewComment.trim() }
                          : {}),
                      });
                    }}
                  >
                    <label>
                      {t("Rating")}{" "}
                      <select
                        value={rating}
                        onChange={event =>
                          setRating(Number(event.target.value))
                        }
                      >
                        {[5, 4, 3, 2, 1].map(value => (
                          <option key={value} value={value}>
                            {value} {t("out of 5")}{" "}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("Comment (optional)")}{" "}
                      <textarea
                        maxLength={2000}
                        rows={3}
                        value={reviewComment}
                        onChange={event => setReviewComment(event.target.value)}
                      />
                    </label>
                    <Button type="submit" disabled={reviewOrder.isPending}>
                      {reviewOrder.isPending
                        ? "Saving review…"
                        : "Submit review"}
                    </Button>
                    {reviewOrder.error && (
                      <p role="alert">{reviewOrder.error.message}</p>
                    )}
                  </form>
                )}
                <p className="summary-small">
                  Only the signed-in customer who placed this delivered order
                  can review it, and each order can be reviewed once.
                </p>
              </section>
            )}
            {["placed", "accepted"].includes(data.order.status) && (
              <section className="workspace-panel">
                <h2>{t("Cancel order")}</h2>
                <p>You can cancel while the order is placed or accepted.</p>
                <label className="field-label">
                  {t("Optional reason")}{" "}
                  <input
                    value={reason}
                    maxLength={1000}
                    onChange={event => setReason(event.target.value)}
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (window.confirm("Cancel this order?"))
                      cancel.mutate({
                        orderId,
                        ...(reason.trim() ? { reason: reason.trim() } : {}),
                      });
                  }}
                >
                  {cancel.isPending ? "Cancelling…" : t("Cancel order")}
                </Button>
                {cancel.error && <p role="alert">{cancel.error.message}</p>}
              </section>
            )}
            <section className="workspace-panel">
              <h2>{t("Shop from this order again")}</h2>
              <p>
                Buy again uses the shop's current listing, price and
                availability in your selected location; old order snapshots are
                not used for prices.
              </p>
              <Button
                disabled={buyAgainRequested || buyAgain.isFetching || !townId}
                onClick={() => setBuyAgainRequested(true)}
              >
                {buyAgainRequested || buyAgain.isFetching
                  ? "Checking current listings…"
                  : "Buy again"}
              </Button>
              {!townId && (
                <p role="alert">
                  Choose an active town before rebuilding this cart.
                </p>
              )}
              {buyAgain.error && (
                <p role="alert">
                  Current shop listings could not be loaded for the selected
                  town/locality: {buyAgain.error.message}
                </p>
              )}
            </section>
            <IntegrationNote title="No live tracking or notifications">
              Order event history is real backend data. GPS tracking, push and
              SMS notifications are not connected.
            </IntegrationNote>
          </>
        )}
      </QueryState>
    </div>
  );
}

export function AccountPage() {
  const { t } = useLanguage();
  const { auth, areas, areasLoading } = useMarket();
  const utils = trpc.useUtils();
  const profileQ = trpc.account.profile.useQuery(undefined, {
    enabled: Boolean(auth.user),
    retry: false,
  });
  const identityQ = trpc.account.me.useQuery(undefined, {
    enabled: !!auth.user,
    retry: false,
  });
  const addressesQ = trpc.account.addresses.useQuery(undefined, {
    enabled: Boolean(auth.user),
    retry: false,
  });
  const towns = areas?.towns ?? [];
  const zones = areas?.zones ?? [];
  const [phone, setPhone] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [label, setLabel] = useState("Home");
  const [recipientName, setRecipientName] = useState(auth.user?.name || "");
  const [addressPhone, setAddressPhone] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [townId, setTownId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const eligibleZones = zones.filter(zone => zone.townId === Number(townId));
  const townLabels = new Map(
    towns.map(town => [town.id, `${town.name}, ${town.state}`])
  );
  const zoneLabels = new Map(
    zones.map(zone => [
      zone.id,
      `${zone.locality}${zone.postalCode ? ` · ${zone.postalCode}` : ""}`,
    ])
  );
  useEffect(() => {
    if (profileQ.data && phone === "") setPhone(profileQ.data.phone || "");
  }, [profileQ.data, phone]);
  const saveProfile = trpc.account.saveProfile.useMutation({
    onSuccess: () => {
      toast.success("Profile saved");
      void utils.account.profile.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const saveAddress = trpc.account.saveAddress.useMutation({
    onSuccess: async () => {
      toast.success("Address saved");
      setEditing(null);
      setLine1("");
      setLine2("");
      await utils.account.addresses.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  if (auth.loading)
    return (
      <div className="page-wrap">
        <div className="loading-card">Checking your account…</div>
      </div>
    );
  if (!auth.user)
    return (
      <div className="page-wrap">
        <div className="account-hero">
          <span className="account-avatar">
            <UserRound />
          </span>
          <p className="eyebrow">ACCOUNT & PRIVACY</p>
          <h1>Your account, your neighbourhood.</h1>
          <p>Sign in with your mobile number to manage your account.</p>
          <LoginButton>{t("Sign in securely")}</LoginButton>
        </div>
        <div className="account-links">
          <Link href="/orders">
            <ShoppingBag /> {t("Order history")} <ArrowRight />
          </Link>
        </div>
        <OtpNote />
        <IntegrationNote title={t("Privacy")}>
          Read our privacy information or request account deletion from the
          links below.
        </IntegrationNote>
      </div>
    );
  const addresses = addressesQ.data ?? [];
  return (
    <div className="page-wrap">
      <div className="page-intro">
        <p className="eyebrow">ACCOUNT & PRIVACY</p>
        <h1>Hello, {auth.user.name || "neighbour"}.</h1>
        <p>Your customer account and saved addresses.</p>
      </div>
      <div className="account-links">
        <Link href="/orders">
          <ShoppingBag /> {t("Order history")} <ArrowRight />
        </Link>
        <Link href="/favorites">
          <Heart /> {t("Favourite shops")} <ArrowRight />
        </Link>
        <Link href="/support">
          <MessageSquareText /> {t("Help & support")} <ArrowRight />
        </Link>
      </div>
      <CustomerPushSettings userId={auth.user.id}/><section className="workspace-panel">
        <h2>{t("Profile")}</h2>
        {identityQ.data?.verifiedMobile && (
          <p className="verified-mobile">
            <ShieldCheck size={15} />
            {t("Verified sign-in number:")}{" "}
            <strong>{identityQ.data.verifiedMobile}</strong>
          </p>
        )}
        <label className="field-label">
          {t("Contact phone")}{" "}
          <input
            type="tel"
            maxLength={30}
            value={phone}
            onChange={event => setPhone(event.target.value)}
            placeholder={t("Optional phone number")}
          />
        </label>
        <Button
          disabled={saveProfile.isPending}
          onClick={() => saveProfile.mutate({ phone })}
        >
          {saveProfile.isPending ? "Saving…" : "Save profile"}
        </Button>
        <p className="summary-small">
          This is your delivery contact number. Editing it does not change your
          verified sign-in number.
        </p>
        {saveProfile.error && <p role="alert">{saveProfile.error.message}</p>}
      </section>
      <section className="workspace-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("Saved addresses")}</h2>
            <p>
              Address ownership and service-area matching are checked by the
              backend.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setEditing(editing === 0 ? null : 0);
              setRecipientName(auth.user?.name || "");
            }}
          >
            {t("Add address")}{" "}
          </Button>
        </div>
        <QueryState loading={addressesQ.isLoading} error={addressesQ.error}>
          {addresses.length ? (
            <div className="address-list">
              {addresses.map(address => (
                <article className="workspace-panel" key={address.id}>
                  <strong>
                    {address.label}
                    {address.isDefault ? " · Default" : ""}
                  </strong>
                  <p>
                    {address.recipientName} · {address.phone}
                    <br />
                    {address.line1}
                    {address.line2 ? `, ${address.line2}` : ""}
                  </p>
                  <small>
                    {townLabels.get(address.townId) || "Inactive town"} ·{" "}
                    {zoneLabels.get(address.zoneId) || "Inactive service zone"}
                  </small>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(address.id);
                      setLabel(address.label);
                      setRecipientName(address.recipientName);
                      setAddressPhone(address.phone);
                      setLine1(address.line1);
                      setLine2(address.line2 || "");
                      setTownId(String(address.townId));
                      setZoneId(String(address.zoneId));
                      setIsDefault(address.isDefault);
                    }}
                  >
                    {t("Edit")}{" "}
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState icon={MapPin} title={t("No saved addresses")}>
              Add a valid address to use delivery checkout. Pickup does not
              require an address.
            </EmptyState>
          )}
        </QueryState>
        {editing !== null && (
          <form
            className="application-form"
            onSubmit={event => {
              event.preventDefault();
              saveAddress.mutate({
                ...(editing > 0 ? { id: editing } : {}),
                townId: Number(townId),
                zoneId: Number(zoneId),
                label,
                recipientName,
                phone: addressPhone,
                line1,
                ...(line2 ? { line2 } : {}),
                isDefault,
              });
            }}
          >
            <h3>{editing ? "Edit address" : "New address"}</h3>
            <label>
              {t("Label")}{" "}
              <input
                required
                maxLength={40}
                value={label}
                onChange={event => setLabel(event.target.value)}
              />
            </label>
            <label>
              {t("Recipient name")}{" "}
              <input
                required
                maxLength={160}
                value={recipientName}
                onChange={event => setRecipientName(event.target.value)}
              />
            </label>
            <label>
              {t("Phone")}{" "}
              <input
                required
                type="tel"
                minLength={5}
                maxLength={30}
                value={addressPhone}
                onChange={event => setAddressPhone(event.target.value)}
              />
            </label>
            <label>
              {t("Address line 1")}{" "}
              <input
                required
                minLength={2}
                maxLength={240}
                value={line1}
                onChange={event => setLine1(event.target.value)}
              />
            </label>
            <label>
              {t("Address line 2")}{" "}
              <input
                maxLength={240}
                value={line2}
                onChange={event => setLine2(event.target.value)}
              />
            </label>
            <label>
              {t("Town")}{" "}
              <select
                required
                value={townId}
                onChange={event => {
                  setTownId(event.target.value);
                  setZoneId("");
                }}
              >
                <option value="">{t("Choose active town")}</option>
                {towns.map(town => (
                  <option key={town.id} value={town.id}>
                    {town.name}, {town.state}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("Service zone")}{" "}
              <select
                required
                value={zoneId}
                onChange={event => setZoneId(event.target.value)}
                disabled={!townId || !eligibleZones.length}
              >
                <option value="">
                  {!townId
                    ? "Choose a town first"
                    : eligibleZones.length
                      ? "Choose eligible service zone"
                      : "No active zones in this town"}
                </option>
                {eligibleZones.map(zone => (
                  <option key={zone.id} value={zone.id}>
                    {zone.locality}
                    {zone.postalCode ? ` · ${zone.postalCode}` : ""} —{" "}
                    {zone.name}
                  </option>
                ))}
              </select>
            </label>
            <small>
              Only active service zones for the selected active town are listed.
              The server checks the town/zone pairing when saved.
            </small>
            {editing !== null && (!towns.length || !eligibleZones.length) && (
              <IntegrationNote
                title={
                  !towns.length
                    ? "No active towns"
                    : "No active service zones in this town"
                }
              >
                Select an active town with at least one active zone, or ask an
                administrator to activate service coverage.
              </IntegrationNote>
            )}
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={event => setIsDefault(event.target.checked)}
              />
              {t("Set as default")}{" "}
            </label>
            <Button
              type="submit"
              disabled={
                saveAddress.isPending || areasLoading || !townId || !zoneId
              }
            >
              {saveAddress.isPending ? "Saving…" : "Save address"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(null)}
            >
              {t("Close")}{" "}
            </Button>
            {saveAddress.error && (
              <p role="alert">{saveAddress.error.message}</p>
            )}
          </form>
        )}
      </section>
      <IntegrationNote title={t("Privacy & account")}>
        <Link href="/privacy">{t("Privacy information")}</Link> ·{" "}
        <Link href="/account-deletion">{t("Request account deletion")}</Link>
      </IntegrationNote>
      <Button variant="outline" onClick={() => auth.logout()}>
        {t("Sign out")}{" "}
      </Button>
    </div>
  );
}
export function FavoritesPage() {
  const { t } = useLanguage();
  const { auth, townId, zoneId, areasLoading } = useMarket();
  const query = trpc.marketplace.favoriteShops.useQuery(
    { townId: townId ?? -1, zoneId: zoneId ?? -1 },
    { enabled: Boolean(auth.user && townId && zoneId), retry: false }
  );
  if (auth.loading)
    return (
      <div className="page-wrap">
        <QueryState loading />
      </div>
    );
  if (!auth.user)
    return (
      <div className="page-wrap">
        <div className="account-hero">
          <span className="account-avatar">
            <Heart />
          </span>
          <p className="eyebrow">YOUR LOCAL FAVOURITES</p>
          <h1>Sign in to see saved shops.</h1>
          <p>Saved shops are private to your signed-in account.</p>
          <LoginButton>{t("Sign in securely")}</LoginButton>
        </div>
      </div>
    );
  return (
    <div className="page-wrap">
      <div className="page-intro">
        <p className="eyebrow">LOCAL FAVOURITES</p>
        <h1>{t("Shops you have saved")}</h1>
        <p>
          Only approved, open shops in your selected service zone are shown.
        </p>
      </div>
      <QueryState loading={areasLoading || query.isLoading} error={query.error}>
        {!zoneId ? (
          <EmptyState icon={Heart} title={t("Choose a service area")}>
            Select a town and locality above to see the saved shops serving you.
          </EmptyState>
        ) : query.data?.length ? (
          <div className="shop-grid">
            {query.data.map(row => (
              <ShopCard key={row.id} shop={toMarketShop(row)} />
            ))}
          </div>
        ) : query.data ? (
          <EmptyState icon={Heart} title={t("No saved shops yet")}>
            Open a local shop and choose “Save this shop” to keep it here.
          </EmptyState>
        ) : null}
      </QueryState>
    </div>
  );
}

export function SignInPage() {
  const { t } = useLanguage();
  const { auth } = useMarket();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const isDevEnv = import.meta.env.DEV;
  const localDemo = trpc.auth.localDemoStatus.useQuery(undefined, { enabled: isDevEnv && !auth.user, retry: false });

  const standaloneLogin = trpc.auth.standaloneLogin.useMutation({
    onSuccess: async result => {
      toast.success(`Signed in as ${result.user?.name || "test user"}`);
      await utils.auth.me.invalidate();
      await utils.account.me.invalidate();
      auth.refresh();
      navigate("/account");
    },
    onError: error => toast.error(error.message),
  });

  const pilotProfiles = [
    {
      label: "Customer",
      persona: "customer" as const,
      name: "Aarti Sharma",
      desc: "Browse your town, order and track your purchases",
    },
  ];

  return (
    <div className="page-wrap sign-in-page">
      <div className="account-hero">
        <span className="account-avatar">
          <ShieldCheck />
        </span>
        <p className="eyebrow">YOUR TOWN, YOUR EVERYDAY</p>
        <h1>{auth.user ? "You're signed in." : "Sign in to Apna Mart"}</h1>
        <p>
          {auth.user
            ? `Signed in as ${auth.user.name || auth.user.email || "User"} (${auth.user.role === "admin" ? "Administrator" : "Standard user"}).`
            : "Sign in to save your addresses, place orders and shop from your local favourites."}
        </p>
        {auth.user ? (
          <div
            className="account-links"
            style={{ justifyContent: "center", marginTop: "1rem" }}
          >
            <Link href="/account" className="primary-link">
              {t("Go to Account")} <ArrowRight />
            </Link>
            <Button variant="outline" onClick={() => auth.logout()}>
              {t("Sign out")}{" "}
            </Button>
          </div>
        ) : (
          <>
            <MobileSignIn />

            {isDevEnv && localDemo.data?.enabled && (
              <div
                className="pilot-auth-card"
                style={{
                  marginTop: "1.5rem",
                  padding: "1.25rem",
                  borderRadius: "0.75rem",
                  background: "var(--card-bg, #ffffff)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  textAlign: "left",
                  maxWidth: "520px",
                  width: "100%",
                }}
              >
                <h2
                  style={{
                    fontSize: "1rem",
                    fontWeight: 600,
                    marginBottom: "0.25rem",
                  }}
                >
                  Local customer demo
                </h2>
                <p
                  style={{
                    fontSize: "0.85rem",
                    color: "var(--muted-foreground, #64748b)",
                    marginBottom: "1rem",
                  }}
                >
                  Use the fictional customer profile to try this isolated
                  preview:
                </p>

                <div
                  style={{
                    display: "grid",
                    gap: "0.5rem",
                    marginBottom: "1rem",
                  }}
                >
                  {pilotProfiles.map(p => (
                    <button
                      key={p.persona}
                      type="button"
                      disabled={standaloneLogin.isPending}
                      onClick={() =>
                        standaloneLogin.mutate({
                          persona: p.persona,
                        })
                      }
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.6rem 0.85rem",
                        borderRadius: "0.5rem",
                        border: "1px solid #cbd5e1",
                        background: "#f8fafc",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <div>
                        <strong
                          style={{ fontSize: "0.9rem", display: "block" }}
                        >
                          {p.label} · {p.name}
                        </strong>
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {p.desc}
                        </span>
                      </div>
                      <ArrowRight
                        style={{
                          width: "16px",
                          height: "16px",
                          color: "#16834A",
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
        <Link href="/" className="text-link">
          {t("Back to shopping")} <ArrowRight />
        </Link>
      </div>
    </div>
  );
}
function OtpNote() {
  const { t } = useLanguage();
  return (
    <IntegrationNote title={t("Keep your handover code private")}>
      Your sign-in OTP is separate from the handover code shown in your order.
      Give the handover code to the shop only when you collect your items.
    </IntegrationNote>
  );
}
function NotFoundOrder() {
  const { t } = useLanguage();
  return (
    <div className="page-wrap">
      <EmptyState icon={CircleHelp} title={t("Order not found")}>
        Check the link or return to your order history.
      </EmptyState>
      <Link href="/orders" className="text-link">
        {t("Order history")} <ArrowRight />
      </Link>
    </div>
  );
}
