import MobileSignIn from "./MobileSignIn";
import { useConnectivity } from "@/lib/connectivity";
import { useLanguage } from "@/contexts/LanguageContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Minus,
  Plus,
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
} from "@/components/MarketCards";
import { useMarket } from "@/components/MarketChrome";
import { formatINR } from "@/lib/marketplace";
import { trpc } from "@/lib/trpc";
import { checkoutIntent, type CheckoutInput } from "@shared/checkout";
import {
  clearCheckoutKey,
  getCheckoutKey,
  readCheckoutAttempt,
} from "@/lib/cart";

export function CheckoutPage() {
  const online = useConnectivity();
  const { t } = useLanguage();
  const { cart, auth, clearCart, setQuantity, townId, zoneId } = useMarket();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const shopId = cart[0]?.product.shopId;
  const [fulfilment, setFulfilment] = useState<"delivery" | "pickup">(
    "delivery"
  );
  const [addressId, setAddressId] = useState<number>();
  const [notes, setNotes] = useState("");
  const [substitution, setSubstitution] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [pendingAttempt, setPendingAttempt] = useState(readCheckoutAttempt);
  const [checkingSubmission, setCheckingSubmission] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  const submitted = useRef(new Map<string, string>());
  const shopQ = trpc.marketplace.shop.useQuery(
    { shopId: shopId ?? -1, townId: townId ?? -1, zoneId: zoneId ?? -1 },
    { enabled: Boolean(shopId && townId && zoneId) }
  );
  const addressesQ = trpc.account.addresses.useQuery(undefined, {
    enabled: Boolean(auth.user),
    retry: false,
  });
  const shop = shopQ.data;
  const compatibleAddresses = useMemo(
    () =>
      (addressesQ.data ?? []).filter(
        address => address.townId === townId && address.zoneId === zoneId
      ),
    [addressesQ.data, townId, zoneId]
  );
  useEffect(() => {
    if (!shop) return;
    setFulfilment(current =>
      current === "delivery" && !shop.deliveryEnabled && shop.pickupEnabled
        ? "pickup"
        : current === "pickup" && !shop.pickupEnabled && shop.deliveryEnabled
          ? "delivery"
          : current
    );
  }, [shop?.id, shop?.deliveryEnabled, shop?.pickupEnabled]);
  useEffect(() => {
    if (
      fulfilment === "delivery" &&
      !compatibleAddresses.some(address => address.id === addressId)
    )
      setAddressId(
        compatibleAddresses.find(address => address.isDefault)?.id ??
          compatibleAddresses[0]?.id
      );
  }, [compatibleAddresses, addressId, fulfilment]);
  const input: CheckoutInput = {
    shopId: shopId ?? -1,
    townId: townId ?? -1,
    zoneId: zoneId ?? -1,
    items: cart.map(line => ({
      productId: line.product.id,
      quantity: line.quantity,
    })),
    fulfillmentType: fulfilment,
    paymentMethod: fulfilment === "delivery" ? "cod" : "pickup",
    ...(fulfilment === "delivery" && addressId ? { addressId } : {}),
    ...(notes.trim() ? { notes: notes.trim() } : {}),
    ...(substitution.trim()
      ? { substitutionPreference: substitution.trim() }
      : {}),
  };
  const fingerprint = checkoutIntent(input, auth.user?.id ?? -1);
  const currentFingerprint = useRef(fingerprint);
  currentFingerprint.current = fingerprint;
  const ready = Boolean(
    auth.user &&
    cart.length &&
    shopId &&
    townId &&
    zoneId &&
    (fulfilment === "pickup" || addressId)
  );
  const quoteQ = trpc.marketplace.quoteOrder.useQuery(input, {
    enabled: ready,
    retry: false,
    refetchOnWindowFocus: true,
  });
  const quote = quoteQ.data;
  const confirmation = quote ? fingerprint + quote.quoteFingerprint : "";
  const priceChanged = quote?.items.some(
    item =>
      cart.find(line => line.product.id === item.productId)?.product
        .pricePaise !== item.unitPricePaise
  );
  const place = trpc.marketplace.placeOrder.useMutation({
    onSuccess: async (result, variables) => {
      await Promise.allSettled([
        utils.marketplace.myOrders.invalidate(),
        utils.marketplace.orderHistory.invalidate(),
        utils.marketplace.orderDetail.invalidate(),
      ]);
      clearCheckoutKey(variables.idempotencyKey);
      setPendingAttempt(undefined);
      if (
        submitted.current.get(variables.idempotencyKey) ===
        currentFingerprint.current
      )
        clearCart();
      submitted.current.delete(variables.idempotencyKey);
      toast.success(
        result.duplicate ? "This order was already submitted" : "Order placed"
      );
      navigate(`/orders/${result.orderId}`);
    },
    onError: error => {
      setConfirmed("");
      void quoteQ.refetch();
      toast.error(error.message);
      requestAnimationFrame(() => errorSummary.current?.focus());
    },
  });
  useEffect(() => { if (!online) setConfirmed(""); }, [online]);
  if (auth.loading)
    return (
      <div className="page-wrap">
        <QueryState loading />
      </div>
    );
  if (!cart.length)
    return (
      <div className="page-wrap">
        <EmptyState icon={ShoppingBag} title={t("Nothing to review")}>
          Add products to your cart before checkout.
        </EmptyState>
        <Link href="/search" className="primary-link">
          {t("Browse shops")} <ArrowRight />
        </Link>
        {auth.user && (
          <Link href="/orders" className="text-link">
            {t("Check submitted orders")} <ArrowRight />
          </Link>
        )}
      </div>
    );
  if (!auth.user) return <div className="page-wrap checkout-page">
    <Link href="/cart" className="back-link"><ArrowLeft />{t("Back to cart")}</Link>
    <MobileSignIn embedded onVerified={() => { void utils.marketplace.quoteOrder.invalidate(); }}/>
  </div>;
  if (!townId || !zoneId || shopQ.error || addressesQ.error)
    return (
      <div className="page-wrap">
        <div className="integration-note" role="alert">
          <div>
            <strong>
              {shopQ.error?.message ||
                addressesQ.error?.message ||
                "Choose an active town and service area above."}
            </strong>
            <p>
              Your cart is retained. You can change locality or edit/remove
              items.
            </p>
            <Link href="/cart" className="text-link">
              {t("Review cart")} <ArrowRight />
            </Link>
            <Link href="/orders" className="text-link">
              {t("Check submitted orders")} <ArrowRight />
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                void shopQ.refetch();
                void addressesQ.refetch();
              }}
            >
              {t("Try again")}{" "}
            </Button>
          </div>
        </div>
      </div>
    );
  if (shopQ.isLoading || addressesQ.isLoading || !shop)
    return (
      <div className="page-wrap">
        <QueryState loading />
      </div>
    );
  const selected = compatibleAddresses.find(
    address => address.id === addressId
  );
  return (
    <div className="page-wrap checkout-page">
      <Link href="/cart" className="back-link">
        <ArrowLeft /> {t("Back to cart")}{" "}
      </Link>
      <div className="page-intro">
        <p className="eyebrow">A CLEAR REVIEW BEFORE YOU ORDER</p>
        <h1>{t("Confirm your order")}</h1>
        <p>
          Cash on delivery or cash on pickup. Payment stays pending until actual
          handover.
        </p>
      </div>
      {pendingAttempt?.customerId === auth.user.id && (
        <IntegrationNote title={t("A previous checkout may have completed")}>
          Check the submitted order before placing another one, including when
          stock is now unavailable.
          <Button
            variant="outline"
            disabled={checkingSubmission || place.isPending}
            onClick={async () => {
              setCheckingSubmission(true);
              try {
                const found = await utils.marketplace.checkoutSubmission.fetch({ key: pendingAttempt.key });
                if (!found) {
                  toast.info(
                    "No submitted order was found yet. Review the current quote, or check again if your connection failed."
                  );
                  return;
                }
                clearCheckoutKey(pendingAttempt.key);
                if (pendingAttempt.fingerprint === currentFingerprint.current)
                  clearCart();
                setPendingAttempt(undefined);
                await utils.marketplace.orderHistory.invalidate();
                navigate(`/orders/${found.id}`);
              } catch {
                toast.error(
                  "Could not check your order. Please retry or open order history."
                );
              } finally {
                setCheckingSubmission(false);
              }
            }}
          >
            {checkingSubmission ? "Checking…" : "Check previous submission"}
          </Button>
          <Link href="/orders" className="text-link">
            {t("Order history")} <ArrowRight />
          </Link>
        </IntegrationNote>
      )}
      {(place.error || quoteQ.error) && (
        <div
          className="integration-note"
          role="alert"
          tabIndex={-1}
          ref={errorSummary}
        >
          <div>
            <strong>{place.error?.message || quoteQ.error?.message}</strong>
            <p>
              Review quantities below, remove unavailable items, or change
              delivery options. Nothing is substituted automatically.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmed("");
                void quoteQ.refetch();
              }}
            >
              {t("Refresh current quote")}{" "}
            </Button>
            <Link href="/cart" className="text-link">
              {t("Edit cart")} <ArrowRight />
            </Link>
          </div>
        </div>
      )}
      <div className="checkout-layout">
        <div className="checkout-steps">
          <section className="checkout-card">
            <h2>
              <span>1</span> {t("Delivery or pickup")}{" "}
            </h2>
            <div className="choice-row">
              <button
                className={
                  fulfilment === "delivery"
                    ? "choice-card selected"
                    : "choice-card"
                }
                disabled={!shop.deliveryEnabled || place.isPending}
                onClick={() => setFulfilment("delivery")}
              >
                <MapPin />
                <strong>{t("Deliver to me")}</strong>
                <small>
                  {shop.deliveryEnabled
                    ? t("Address in this shop's service area")
                    : t("Delivery unavailable")}
                </small>
              </button>
              <button
                className={
                  fulfilment === "pickup"
                    ? "choice-card selected"
                    : "choice-card"
                }
                disabled={!shop.pickupEnabled || place.isPending}
                onClick={() => setFulfilment("pickup")}
              >
                <Store />
                <strong>{t("I'll pick it up")}</strong>
                <small>
                  {shop.pickupEnabled
                    ? t("Cash at the shop")
                    : t("Pickup unavailable")}
                </small>
              </button>
            </div>
            {fulfilment === "delivery" &&
              (compatibleAddresses.length ? (
                <label className="field-label">
                  {t("Delivery address")}{" "}
                  <select
                    disabled={place.isPending}
                    value={addressId ?? ""}
                    onChange={event => setAddressId(Number(event.target.value))}
                  >
                    <option value="" disabled>
                      {t("Select an address")}{" "}
                    </option>
                    {compatibleAddresses.map(address => (
                      <option key={address.id} value={address.id}>
                        {address.label}: {address.line1}
                      </option>
                    ))}
                  </select>
                  <small>
                    {quote?.address
                      ? `Current delivery address: ${quote.address.recipientName} · ${quote.address.phone} · ${quote.address.line1}${quote.address.line2 ? `, ${quote.address.line2}` : ""}`
                      : "Select an address and wait for its current server quote."}
                  </small>
                  {quote?.address &&
                    selected &&
                    (selected.line1 !== quote.address.line1 ||
                      selected.phone !== quote.address.phone ||
                      selected.recipientName !==
                        quote.address.recipientName) && (
                      <small role="status">
                        This saved address changed. Review the current delivery
                        address above before confirming.
                      </small>
                    )}
                </label>
              ) : (
                <IntegrationNote
                  title={t("No address matches this shop's service area")}
                >
                  Add an address in {shop.locality} or choose pickup.{" "}
                  <Link href="/account" className="text-link">
                    {t("Add or update an address")} <ArrowRight />
                  </Link>
                </IntegrationNote>
              ))}
          </section>
          <section className="checkout-card">
            <h2>
              <span>2</span> {t("Payment method")}{" "}
            </h2>
            <label className="radio-row selected">
              <input type="radio" checked readOnly />
              <span>
                <strong>
                  {fulfilment === "delivery"
                    ? t("Cash on delivery")
                    : t("Cash on pickup")}
                </strong>
                <small>{t("Pay in cash at handover.")}</small>
              </span>
            </label>
            <IntegrationNote title={t("Cash only")}>
              Online payments are not enabled. Your handover code is shown
              privately in your order; no SMS is sent.
            </IntegrationNote>
          </section>
          <section className="checkout-card">
            <h2>
              <span>3</span> {t("Notes for the shop")}{" "}
            </h2>
            <label className="field-label">
              {t("Order note")}{" "}
              <textarea
                disabled={place.isPending}
                value={notes}
                onChange={event => setNotes(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder={t("Optional instruction")}
              />
            </label>
            <label className="field-label">
              {t("Substitution preference")}{" "}
              <input
                disabled={place.isPending}
                value={substitution}
                onChange={event => setSubstitution(event.target.value)}
                maxLength={80}
                placeholder={t("Optional preference")}
              />
            </label>
            <small>
              These are preference notes. Products and sellers are never
              replaced automatically.
            </small>
          </section>
        </div>
        <aside className="cart-summary checkout-summary">
          <p className="eyebrow">{t("FROM ONE SHOP")}</p>
          <h2>{shop.shopName}</h2>
          {cart.map(({ product, quantity }) => {
            const quoted = quote?.items.find(
              item => item.productId === product.id
            );
            return (
              <div className="checkout-item" key={product.id}>
                <span>
                  {quantity} × {quoted?.name ?? product.name}
                  <small>
                    {quoted
                      ? formatINR(quoted.unitPricePaise) + " / " + quoted.unit
                      : "Awaiting current price"}
                  </small>
                </span>
                <strong>
                  {quoted ? formatINR(quoted.lineTotalPaise) : "—"}
                </strong>
                <div className="quantity-control compact">
                  <button
                    aria-label={"Remove one " + product.name}
                    disabled={place.isPending}
                    onClick={() => setQuantity(product.id, quantity - 1)}
                  >
                    <Minus />
                  </button>
                  <strong>{quantity}</strong>
                  <button
                    aria-label={"Add one " + product.name}
                    disabled={quantity >= 100 || place.isPending}
                    onClick={() => setQuantity(product.id, quantity + 1)}
                  >
                    <Plus />
                  </button>
                </div>
                <button
                  className="remove-link"
                  disabled={place.isPending}
                  onClick={() => setQuantity(product.id, 0)}
                >
                  <Trash2 /> {t("Remove")}{" "}
                </button>
              </div>
            );
          })}
          <div className="summary-divider" />
          {quote ? (
            <>
              <div>
                <span>{t("Items subtotal")}</span>
                <strong>{formatINR(quote.totals.subtotalPaise)}</strong>
              </div>
              {quote.totals.taxPaise > 0 && <div><span>{t("GST included")}</span><strong>{formatINR(quote.totals.taxPaise)}</strong></div>}
              <div>
                <span>{t("Delivery")}</span>
                <strong>
                  {fulfilment === "delivery"
                    ? formatINR(quote.totals.deliveryFeePaise)
                    : t("Pickup")}
                </strong>
              </div>
              <div>
                <span>{t("Platform fee")}</span>
                <strong>{formatINR(quote.totals.platformFeePaise)}</strong>
              </div>
              <div>
                <span>{t("Total payable")}</span>
                <strong>{formatINR(quote.totals.totalPaise)}</strong>
              </div>
            </>
          ) : (
            <p role="status">
              {quoteQ.isFetching
                ? "Checking current prices and availability…"
                : "A current server quote is required before you can order."}
            </p>
          )}
          {priceChanged && (
            <p role="status" className="summary-small">
              Prices have changed since you added these items. Review the
              current prices above before confirming.
            </p>
          )}
          <label className="radio-row">
            <input
              type="checkbox"
              checked={Boolean(confirmation && confirmed === confirmation)}
              disabled={
                !quote ||
                quoteQ.isFetching ||
                Boolean(quoteQ.error) ||
                place.isPending
              }
              onChange={event =>
                setConfirmed(event.target.checked ? confirmation : "")
              }
            />
            <span>
              {t(
                "I reviewed the current items, address and total payable."
              )}{" "}
            </span>
          </label>
          <Button
            size="lg"
            disabled={
              !online ||
              !ready ||
              !quote ||
              quoteQ.isFetching ||
              Boolean(quoteQ.error) ||
              confirmed !== confirmation ||
              !confirmation ||
              place.isPending
            }
            onClick={() => {
              if (!quote || !auth.user || confirmed !== confirmation) return;
              const idempotencyKey = getCheckoutKey(fingerprint);
              setPendingAttempt(readCheckoutAttempt());
              submitted.current.set(idempotencyKey, fingerprint);
              place.mutate({
                ...input,
                idempotencyKey,
                quoteFingerprint: quote.quoteFingerprint,
              });
            }}
          >
            {!online ? t("Reconnect to place order") : place.isPending ? t("Submitting…") : t("Place order")}
          </Button>
          <p className="summary-small">
            {t("The shop checks availability when you confirm. If anything changes, review the updated total before trying again.")}
          </p>
        </aside>
      </div>
    </div>
  );
}
