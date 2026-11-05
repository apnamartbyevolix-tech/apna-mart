import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Bike,
  Boxes,
  CircleHelp,
  ClipboardList,
  MapPin,
  MessageSquareText,
  PackageCheck,
  Plus,
  Send,
  Settings2,
  ShieldCheck,
  Store,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  IntegrationNote,
  QueryState,
} from "@/components/MarketCards";
import { LoginButton, useMarket } from "@/components/MarketChrome";
import { trpc } from "@/lib/trpc";
import { formatINR, titleCase } from "@/lib/marketplace";

const vendorNav = [
  { href: "/vendor", label: "Overview", icon: Activity },
  { href: "/vendor/orders", label: "Orders", icon: ClipboardList },
  { href: "/vendor/products", label: "Products", icon: Boxes },
];
const riderNav = [
  { href: "/rider", label: "Deliveries", icon: Truck },
  { href: "/rider/register", label: "Rider registration", icon: Bike },
];
const adminNav = [
  { href: "/admin", label: "Overview", icon: Activity },
  { href: "/admin/vendors", label: "Vendor review", icon: Store },
  { href: "/admin/orders", label: "Orders & assignment", icon: ClipboardList },
  { href: "/admin/riders", label: "Riders", icon: Bike },
  { href: "/admin/categories", label: "Categories", icon: Boxes },
  { href: "/admin/support", label: "Customer support", icon: MessageSquareText },
  { href: "/admin/settings", label: "Settings", icon: Settings2 },
];

function AccessGate({
  area,
  expected,
  children,
}: {
  area: string;
  expected?: "admin" | "vendor" | "rider";
  children: React.ReactNode;
}) {
  const { auth } = useMarket();
  const account = trpc.account.me.useQuery(undefined, {
    enabled: Boolean(auth.user),
    retry: false,
  });
  if (auth.loading || (auth.user && account.isLoading))
    return (
      <div className="workspace-gate">
        <span className="loading-spinner" />
        <p>Checking your secure sign-in…</p>
      </div>
    );
  if (auth.error || account.error)
    return (
      <div className="workspace-gate">
        <CircleHelp />
        <h1>We couldn't verify access.</h1>
        <p>Workspace records are not shown.</p>
        <Button
          onClick={() => {
            void auth.refresh();
            void account.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  if (!auth.user)
    return (
      <div className="workspace-gate">
        <ShieldCheck />
        <p className="eyebrow">{area.toUpperCase()} WORKSPACE</p>
        <h1>Sign in to continue.</h1>
        <p>
          Use real Manus OAuth. No role switcher, test account or fabricated
          credentials are provided.
        </p>
        <LoginButton>Continue with Manus</LoginButton>
      </div>
    );
  const permitted =
    expected === "admin"
      ? auth.user.role === "admin"
      : expected === "vendor"
        ? account.data?.vendor?.status === "approved"
        : expected === "rider"
          ? account.data?.rider?.status === "approved"
          : false;
  if (!permitted)
    return (
      <div className="workspace-gate">
        <ShieldCheck />
        <p className="eyebrow">{area.toUpperCase()} WORKSPACE</p>
        <h1>
          {expected === "vendor" && account.data?.vendor?.status === "pending"
            ? "Application pending review"
            : expected === "rider" && account.data?.rider?.status === "pending"
              ? "Rider application pending"
              : "This workspace isn't available for this account."}
        </h1>
        <p>
          Role and record authorization are enforced by the backend. Submit an
          application or wait for approval where applicable.
        </p>
        <Link
          href={
            expected === "vendor"
              ? "/vendor/signup"
              : expected === "rider"
                ? "/rider/register"
                : "/account"
          }
          className="text-link"
        >
          Continue <ArrowRight />
        </Link>
      </div>
    );
  return <>{children}</>;
}
function WorkspaceLayout({
  title,
  caption,
  nav,
  children,
  className = "",
}: {
  title: string;
  caption: string;
  nav: typeof vendorNav;
  children: React.ReactNode;
  className?: string;
}) {
  const [location] = useLocation();
  return (
    <div className={`workspace ${className}`}>
      <aside className="workspace-rail">
        <Link href="/" className="workspace-brand">
          <span className="brand-symbol">
            <MapPin />
            <span className="brand-leaf" />
          </span>
          <span>
            MyTown
            <br />
            <b>{title}</b>
          </span>
        </Link>
        <span className="workspace-caption">{caption}</span>
        <nav>
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={
                location === href ? "workspace-nav active" : "workspace-nav"
              }
            >
              <Icon />
              <span>{label}</span>
              <ArrowRight className="nav-arrow" />
            </Link>
          ))}
        </nav>
        <Link href="/" className="workspace-back">
          <ArrowLeft /> Back to marketplace
        </Link>
      </aside>
      <div className="workspace-content">
        <header className="workspace-topbar">
          <span>
            <span className="status-dot on" /> Connected to marketplace backend
          </span>
          <span className="workspace-demo-pill">Server-authorized</span>
        </header>
        {children}
      </div>
    </div>
  );
}
function EmptyQueue({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="queue-empty">
      <span>
        <ClipboardList />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
function WorkspaceTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="workspace-title">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
}) {
  return (
    <div className="metric-card">
      <span className="metric-icon">
        <Icon />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <span className="metric-hint">Backend record</span>
      </div>
    </div>
  );
}
function Status({ value }: { value: string }) {
  return <span className="workspace-demo-pill">{titleCase(value)}</span>;
}
function errorToast(error: { message: string }) {
  toast.error(error.message);
}
async function imageFileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000)
    binary += String.fromCharCode(
      ...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length))
    );
  return btoa(binary);
}
type VendorStatusAction =
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "failed_delivery"
  | "rejected";
type VendorOrderFields = {
  reason?: string;
  handoverCode?: string;
  cashAmountPaise?: number;
  cashNote?: string;
};

export function VendorPage({
  section = "overview",
}: {
  section?: "overview" | "products" | "orders" | "signup";
}) {
  return section === "signup" ? (
    <VendorSignup />
  ) : (
    <AccessGate area="Vendor" expected="vendor">
      <VendorDesk section={section} />
    </AccessGate>
  );
}
function VendorSignup() {
  const {
    auth,
    areas,
    areasLoading,
    townId: marketTownId,
    zoneId: marketZoneId,
    locality,
  } = useMarket();
  const home = trpc.marketplace.home.useQuery(
    { townId: marketTownId ?? -1, zoneId: marketZoneId ?? -1 },
    { enabled: Boolean(auth.user && marketTownId && marketZoneId && !areasLoading) }
  );
  const status = trpc.vendor.status.useQuery(undefined, {
    enabled: Boolean(auth.user),
    retry: false,
  });
  const utils = trpc.useUtils();
  const towns = areas?.towns ?? [];
  const allZones = areas?.zones ?? [];
  const [townId, setTownId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const zones = allZones.filter(z => z.townId === Number(townId));
  const [categoryId, setCategoryId] = useState("");
  const [shopName, setShopName] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const submit = trpc.vendor.register.useMutation({
    onSuccess: async r => {
      toast.success(
        r.status === "pending"
          ? "Application submitted for review"
          : `Application already exists (${r.status})`
      );
      await Promise.all([
        utils.vendor.status.invalidate(),
        utils.account.me.invalidate(),
      ]);
    },
    onError: errorToast,
  });
  if (auth.loading)
    return (
      <div className="page-wrap">
        <div className="loading-card">Checking your secure sign-in…</div>
      </div>
    );
  if (!auth.user)
    return (
      <div className="page-wrap">
        <div className="workspace-gate">
          <Store />
          <p className="eyebrow">SELL ON MYTOWN</p>
          <h1>Bring your shop closer to home.</h1>
          <p>Secure sign-in is required before applying.</p>
          <LoginButton />
        </div>
      </div>
    );
  if (status.isLoading || home.isLoading || areasLoading)
    return (
      <div className="page-wrap">
        <QueryState loading />
      </div>
    );
  if (status.error || home.error)
    return (
      <div className="page-wrap">
        <QueryState loading={false} error={status.error || home.error} />
      </div>
    );
  if (status.data)
    return (
      <div className="page-wrap">
        <div className="page-intro">
          <p className="eyebrow">MERCHANT APPLICATION</p>
          <h1>{status.data.shopName}</h1>
          <p>
            Current application status: <Status value={status.data.status} />
          </p>
        </div>
        <IntegrationNote
          title={
            status.data.status === "pending"
              ? "Awaiting admin review"
              : "Vendor profile exists"
          }
        >
          You cannot sell until the server reports an approved vendor. The
          application is persisted by the backend.
        </IntegrationNote>
        <Link href="/vendor" className="primary-link">
          Vendor workspace <ArrowRight />
        </Link>
      </div>
    );
  return (
    <div className="page-wrap signup-page">
      <Link href="/vendor" className="back-link">
        <ArrowLeft /> Vendor workspace
      </Link>
      <div className="page-intro">
        <p className="eyebrow">MERCHANT APPLICATION</p>
        <h1>Tell us about your shop.</h1>
        <p>New vendors require review and approval before selling.</p>
      </div>
      <form
        className="application-form"
        onSubmit={e => {
          e.preventDefault();
          submit.mutate({
            townId: Number(townId),
            zoneId: Number(zoneId),
            categoryId: Number(categoryId),
            shopName,
            address,
            ...(description ? { description } : {}),
            ...(phone ? { phone } : {}),
          });
        }}
      >
        <label>
          Shop name
          <input
            required
            minLength={2}
            maxLength={180}
            value={shopName}
            onChange={e => setShopName(e.target.value)}
          />
        </label>
        <label>
          Shop category
          <select
            required
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
          >
            <option value="">Select enabled category</option>
            {(home.data?.categories ?? []).map(c => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Town
          <select
            required
            value={townId}
            onChange={e => {
              setTownId(e.target.value);
              setZoneId("");
            }}
          >
            <option value="">Choose active town</option>
            {towns.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}, {t.state}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service zone
          <select
            required
            value={zoneId}
            disabled={!townId || !zones.length}
            onChange={e => setZoneId(e.target.value)}
          >
            <option value="">
              {!townId
                ? "Choose a town first"
                : zones.length
                  ? "Choose service zone"
                  : "No active zones in this town"}
            </option>
            {zones.map(z => (
              <option key={z.id} value={z.id}>
                {z.locality}
                {z.postalCode ? ` · ${z.postalCode}` : ""} — {z.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Shop address
          <input
            required
            minLength={2}
            maxLength={1000}
            value={address}
            onChange={e => setAddress(e.target.value)}
          />
        </label>
        <label>
          Business description
          <textarea
            maxLength={3000}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </label>
        <label>
          Contact phone
          <input
            type="tel"
            minLength={5}
            maxLength={30}
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </label>
        <small>
          Only active zones belonging to the selected active town are shown; the
          server validates the pairing again.
        </small>
        {!towns.length && (
          <IntegrationNote title="No active towns">
            Ask an administrator to activate a town and add a service zone
            before applying.
          </IntegrationNote>
        )}
        <Button
          disabled={
            submit.isPending ||
            !home.data?.categories.length ||
            !townId ||
            !zoneId
          }
        >
          {submit.isPending ? "Submitting…" : "Submit application"}
        </Button>
      </form>
    </div>
  );
}
function VendorDesk({
  section,
}: {
  section: "overview" | "products" | "orders";
}) {
  const { townId, zoneId, locality, areasLoading } = useMarket();
  const dash = trpc.vendor.dashboard.useQuery(undefined, { retry: false });
  const products = trpc.vendor.products.useQuery(undefined, { retry: false });
  const orders = trpc.vendor.orders.useQuery(undefined, { retry: false });
  const categoryQ = trpc.marketplace.home.useQuery(
    { townId: townId ?? -1, zoneId: zoneId ?? -1 },
    { enabled: !areasLoading && Boolean(townId && zoneId) }
  );
  const utils = trpc.useUtils();
  const vendor = dash.data?.vendor;
  const [productForm, setProductForm] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("piece");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("0");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUploadError, setImageUploadError] = useState("");
  const refresh = async () => {
    await Promise.all([
      utils.vendor.dashboard.invalidate(),
      utils.vendor.products.invalidate(),
      utils.vendor.orders.invalidate(),
      utils.marketplace.home.invalidate(),
      utils.marketplace.search.invalidate(),
      utils.marketplace.shop.invalidate(),
      utils.marketplace.product.invalidate(),
    ]);
  };
  const uploadImage = trpc.vendor.uploadProductImage.useMutation();
  const finishProductSave = async (productId: number) => {
    if (imageFile) {
      try {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
        if (
          !allowedTypes.includes(imageFile.type) ||
          imageFile.size > 2 * 1024 * 1024
        )
          throw new Error(
            "Choose a JPEG, PNG or WebP image no larger than 2 MiB."
          );
        await uploadImage.mutateAsync({
          productId,
          contentType: imageFile.type as
            | "image/jpeg"
            | "image/png"
            | "image/webp",
          dataBase64: await imageFileBase64(imageFile),
        });
      } catch (error) {
        setEditing(productId);
        const message = `Product saved, but image upload failed: ${error instanceof Error ? error.message : "Please retry the upload."}`;
        setImageUploadError(message);
        toast.error(message);
        await refresh();
        return;
      }
    }
    setImageUploadError("");
    toast.success(imageFile ? "Product and image saved" : "Product saved");
    setProductForm(false);
    setEditing(null);
    setImageFile(null);
    setName("");
    setDescription("");
    await refresh();
  };
  const create = trpc.vendor.createProduct.useMutation({
    onSuccess: async result => {
      await finishProductSave(result.id);
    },
    onError: errorToast,
  });
  const update = trpc.vendor.updateProduct.useMutation({
    onSuccess: async (_result, variables) => {
      await finishProductSave(variables.productId);
    },
    onError: errorToast,
  });
  const archive = trpc.vendor.archiveProduct.useMutation({
    onSuccess: refresh,
    onError: errorToast,
  });
  const setOpen = trpc.vendor.setOpen.useMutation({
    onSuccess: refresh,
    onError: errorToast,
  });
  const deliverySettings = trpc.vendor.updateDeliverySettings.useMutation({
    onSuccess: async () => {
      toast.success("Shop fulfillment settings saved");
      await refresh();
    },
    onError: errorToast,
  });
  const changeOrder = trpc.vendor.updateOrderStatus.useMutation({
    onSuccess: async result => {
      if (result.cashRecorded && !result.cashCollected)
        toast.warning(
          "Pickup completed; the cash difference is recorded and remains pending admin review."
        );
      else
        toast.success(
          result.cashCollected
            ? "Pickup completed and exact cash recorded"
            : "Order status updated"
        );
      await refresh();
    },
    onError: errorToast,
  });
  const loading = dash.isLoading || products.isLoading || orders.isLoading;
  if (loading)
    return (
      <WorkspaceLayout
        title="Vendor"
        caption="LOCAL SHOP OPERATIONS"
        nav={vendorNav}
      >
        <div className="workspace-main">
          <QueryState loading />
        </div>
      </WorkspaceLayout>
    );
  const error = dash.error || products.error || orders.error;
  const beginEdit = (product: any) => {
    setEditing(product.id);
    setName(product.name);
    setCategoryId(String(product.categoryId));
    setUnit(product.unit);
    setPrice((product.pricePaise / 100).toFixed(2));
    setStock(String(product.stockQuantity));
    setDescription(product.description || "");
    setImageFile(null);
    setImageUploadError("");
    setProductForm(true);
  };
  const saveProduct = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      imageFile &&
      (!["image/jpeg", "image/png", "image/webp"].includes(imageFile.type) ||
        imageFile.size > 2 * 1024 * 1024)
    ) {
      toast.error("Choose a JPEG, PNG or WebP image no larger than 2 MiB.");
      return;
    }
    const payload = {
      categoryId: Number(categoryId),
      name,
      unit,
      pricePaise: Math.round(Number(price) * 100),
      stockQuantity: Number(stock),
      ...(description ? { description } : {}),
    };
    if (editing) update.mutate({ productId: editing, patch: payload });
    else create.mutate(payload);
  };
  const savePending =
    create.isPending || update.isPending || uploadImage.isPending;
  return (
    <WorkspaceLayout
      title="Vendor"
      caption="LOCAL SHOP OPERATIONS"
      nav={vendorNav}
      className="vendor-workspace"
    >
      <div className="workspace-main">
        <WorkspaceTitle
          eyebrow="MERCHANT DESK"
          title={
            section === "products"
              ? "Your products"
              : section === "orders"
                ? "Shop orders"
                : "Your shop, at a glance."
          }
          description="Live data scoped to your server-approved vendor profile."
        />
        {error ? (
          <QueryState loading={false} error={error} />
        ) : (
          dash.data &&
          products.data &&
          orders.data && (
            <>
              <div className="rider-availability">
                <div>
                  <span
                    className={vendor?.isOpen ? "status-dot on" : "status-dot"}
                  />
                  <div>
                    <strong>
                      {vendor?.isOpen ? "Shop is open" : "Shop is closed"}
                    </strong>
                    <small>
                      Only approved shops may change ordering availability.
                    </small>
                  </div>
                </div>
                <Button
                  variant="outline"
                  disabled={setOpen.isPending}
                  onClick={() => setOpen.mutate({ isOpen: !vendor?.isOpen })}
                >
                  {vendor?.isOpen ? "Close shop" : "Open shop"}
                </Button>
              </div>
              <VendorSettingsPanel
                vendor={vendor}
                saving={deliverySettings.isPending}
                onSave={payload => deliverySettings.mutate(payload)}
              />
              {section === "overview" && (
                <>
                  <div className="metric-grid">
                    <Metric
                      label="Orders today"
                      value={String(dash.data.ordersToday)}
                      icon={ClipboardList}
                    />
                    <Metric
                      label="Pending orders"
                      value={String(dash.data.pendingOrders)}
                      icon={WalletCards}
                    />
                    <Metric
                      label="Sales today"
                      value={formatINR(dash.data.salesTodayPaise)}
                      icon={WalletCards}
                    />
                    <Metric
                      label="Completed orders"
                      value={String(dash.data.completedOrders)}
                      icon={PackageCheck}
                    />
                    <Metric
                      label="Products listed"
                      value={String(dash.data.productsListed)}
                      icon={Boxes}
                    />
                    <Metric
                      label="Low stock (≤5)"
                      value={String(dash.data.lowStockProducts)}
                      icon={PackageCheck}
                    />
                  </div>
                  <OrdersPanel
                    orders={orders.data.slice(0, 5)}
                    mutate={(orderId, status, fields) =>
                      changeOrder.mutate({ orderId, status, ...fields })
                    }
                    pending={changeOrder.isPending}
                  />
                  <ProductsPanel
                    data={products.data.slice(0, 5)}
                    onEdit={beginEdit}
                    onArchive={id => archive.mutate({ productId: id })}
                  />
                </>
              )}
              {section === "products" && (
                <section className="workspace-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Product catalogue</h2>
                      <p>
                        Prices are entered in rupees and submitted as integer
                        paise.
                      </p>
                      <p>
                        Optional image upload accepts JPEG, PNG or WebP up to 2
                        MiB.
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setProductForm(!productForm);
                        setEditing(null);
                        setImageFile(null);
                        setImageUploadError("");
                      }}
                    >
                      <Plus /> Add product
                    </Button>
                  </div>
                  {productForm && (
                    <form className="application-form" onSubmit={saveProduct}>
                      <label>
                        Name
                        <input
                          required
                          maxLength={180}
                          value={name}
                          onChange={event => setName(event.target.value)}
                        />
                      </label>
                      <label>
                        Category
                        <select
                          required
                          value={categoryId}
                          onChange={event => setCategoryId(event.target.value)}
                        >
                          <option value="">Choose category</option>
                          {(categoryQ.data?.categories ?? []).map(category => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Unit
                        <input
                          required
                          maxLength={48}
                          value={unit}
                          onChange={event => setUnit(event.target.value)}
                          placeholder="kg, litre, piece…"
                        />
                      </label>
                      <label>
                        Price (₹)
                        <input
                          required
                          type="number"
                          step="0.01"
                          min="0"
                          value={price}
                          onChange={event => setPrice(event.target.value)}
                        />
                      </label>
                      <label>
                        Stock quantity
                        <input
                          required
                          type="number"
                          step="1"
                          min="0"
                          value={stock}
                          onChange={event => setStock(event.target.value)}
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          maxLength={5000}
                          value={description}
                          onChange={event => setDescription(event.target.value)}
                        />
                      </label>
                      <label>
                        Product image (optional)
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={event => {
                            setImageFile(event.target.files?.[0] ?? null);
                            setImageUploadError("");
                          }}
                        />
                        <small>
                          {imageFile
                            ? `${imageFile.name} · ${(imageFile.size / 1024).toFixed(0)} KiB`
                            : "JPEG, PNG or WebP; maximum 2 MiB."}
                        </small>
                      </label>
                      {imageUploadError && (
                        <p role="alert">{imageUploadError}</p>
                      )}
                      <Button type="submit" disabled={savePending}>
                        {savePending
                          ? uploadImage.isPending
                            ? "Uploading image…"
                            : "Saving product…"
                          : editing
                            ? "Save changes"
                            : "Create product"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={savePending}
                        onClick={() => {
                          setProductForm(false);
                          setEditing(null);
                          setImageFile(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </form>
                  )}
                  <ProductsPanel
                    data={products.data}
                    onEdit={beginEdit}
                    onArchive={id => archive.mutate({ productId: id })}
                  />
                </section>
              )}
              {section === "orders" && (
                <OrdersPanel
                  orders={orders.data}
                  mutate={(orderId, status, fields) =>
                    changeOrder.mutate({ orderId, status, ...fields })
                  }
                  pending={changeOrder.isPending}
                />
              )}
            </>
          )
        )}
      </div>
    </WorkspaceLayout>
  );
}
function VendorSettingsPanel({
  vendor,
  saving,
  onSave,
}: {
  vendor: any;
  saving: boolean;
  onSave: (payload: any) => void;
}) {
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [minimumOrder, setMinimumOrder] = useState("0");
  const [preparationMinutes, setPreparationMinutes] = useState("30");
  const [openingTime, setOpeningTime] = useState("");
  const [closingTime, setClosingTime] = useState("");
  const utils = trpc.useUtils();
  const storeImage = trpc.vendor.uploadStoreImage.useMutation({
    onSuccess: async (_result, variables) => {
      toast.success(variables.imageType === "logo" ? "Shop logo updated" : "Shop cover photo updated");
      await Promise.all([utils.vendor.dashboard.invalidate(), utils.marketplace.home.invalidate()]);
    },
    onError: errorToast,
  });
  const uploadShopImage = async (imageType: "logo" | "cover", file?: File) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
      toast.error("Choose a JPEG, PNG or WebP image no larger than 2 MiB.");
      return;
    }
    try {
      await storeImage.mutateAsync({
        imageType,
        contentType: file.type as "image/jpeg" | "image/png" | "image/webp",
        dataBase64: await imageFileBase64(file),
      });
    } catch {
      // The mutation's error handler shows the storage or validation error.
    }
  };
  useEffect(() => {
    if (vendor) {
      setDeliveryEnabled(Boolean(vendor.deliveryEnabled));
      setPickupEnabled(Boolean(vendor.pickupEnabled));
      setDeliveryFee((vendor.deliveryFeePaise / 100).toFixed(2));
      setMinimumOrder((vendor.minimumOrderPaise / 100).toFixed(2));
      setPreparationMinutes(String(vendor.preparationMinutes ?? 30));
      setOpeningTime(vendor.settings?.openingTime ?? "");
      setClosingTime(vendor.settings?.closingTime ?? "");
    }
  }, [vendor]);
  return (
    <section className="workspace-panel">
      <div className="panel-heading">
        <div>
          <h2>Delivery & pickup settings</h2>
          <p>
            These values reflect the persisted shop profile; times use 24-hour
            local time.
          </p>
        </div>
      </div>
      <form
        className="application-form"
        onSubmit={e => {
          e.preventDefault();
          onSave({
            deliveryEnabled,
            pickupEnabled,
            deliveryFeePaise: Math.round(Number(deliveryFee) * 100),
            minimumOrderPaise: Math.round(Number(minimumOrder) * 100),
            preparationMinutes: Number(preparationMinutes),
            ...(openingTime ? { openingTime } : {}),
            ...(closingTime ? { closingTime } : {}),
          });
        }}
      >
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={deliveryEnabled}
            onChange={e => setDeliveryEnabled(e.target.checked)}
          />
          Delivery enabled
        </label>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={pickupEnabled}
            onChange={e => setPickupEnabled(e.target.checked)}
          />
          Pickup enabled
        </label>
        <label>
          Delivery fee (₹)
          <input
            type="number"
            min="0"
            max="500"
            step="0.01"
            required
            value={deliveryFee}
            onChange={e => setDeliveryFee(e.target.value)}
          />
        </label>
        <label>
          Minimum order (₹)
          <input
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            required
            value={minimumOrder}
            onChange={e => setMinimumOrder(e.target.value)}
          />
        </label>
        <label>
          Preparation time (minutes)
          <input
            type="number"
            min="5"
            max="240"
            step="1"
            required
            value={preparationMinutes}
            onChange={e => setPreparationMinutes(e.target.value)}
          />
        </label>
        <label>
          Opening time
          <input
            type="time"
            value={openingTime}
            onChange={e => setOpeningTime(e.target.value)}
          />
        </label>
        <label>
          Closing time
          <input
            type="time"
            value={closingTime}
            onChange={e => setClosingTime(e.target.value)}
          />
        </label>
        <Button disabled={saving}>
          {saving ? "Saving…" : "Save fulfillment settings"}
        </Button>
      </form>
      <div className="store-media-fields">
        {(["logo", "cover"] as const).map(imageType => {
          const url = imageType === "logo" ? vendor?.logoUrl : vendor?.coverUrl;
          return <label className={`store-media-card ${imageType}`} key={imageType}>
            <span>{imageType === "logo" ? "Shop logo" : "Shop cover photo"}</span>
            <div className="store-media-preview">
              {url ? <img src={url} alt={imageType === "logo" ? "Current shop logo" : "Current shop cover"} loading="lazy" /> : <Store aria-hidden="true" />}
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={storeImage.isPending}
              aria-label={`Upload ${imageType === "logo" ? "shop logo" : "shop cover photo"}`}
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void uploadShopImage(imageType, file);
              }}
            />
            <small>JPEG, PNG or WebP · up to 2 MiB. Upload replaces the current image.</small>
          </label>;
        })}
      </div>
    </section>
  );
}
function ProductsPanel({
  data,
  onEdit,
  onArchive,
}: {
  data: any[];
  onEdit: (p: any) => void;
  onArchive: (id: number) => void;
}) {
  return (
    <section className="workspace-panel">
      <div className="panel-heading">
        <div>
          <h2>Product catalogue</h2>
          <p>{data.length} server records</p>
        </div>
      </div>
      {data.length ? (
        <div className="admin-list">
          {data.map(p => (
            <article className="admin-list-row" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <p>
                  {formatINR(p.pricePaise)} / {p.unit} · stock {p.stockQuantity}{" "}
                  · {p.availability}
                </p>
              </div>
              <Button variant="outline" onClick={() => onEdit(p)}>
                Edit
              </Button>
              {p.availability !== "archived" && (
                <Button variant="outline" onClick={() => onArchive(p.id)}>
                  Archive
                </Button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <EmptyQueue
          title="No products yet"
          description="Add a product to begin building your catalogue."
        />
      )}
    </section>
  );
}
function OrdersPanel({
  orders,
  mutate,
  pending,
}: {
  orders: any[];
  mutate: (
    orderId: number,
    status: VendorStatusAction,
    fields?: VendorOrderFields
  ) => void;
  pending: boolean;
}) {
  const [reasonByOrder, setReasonByOrder] = useState<Record<number, string>>(
    {}
  );
  const [detailId, setDetailId] = useState<number | null>(null);
  return (
    <section className="workspace-panel">
      <div className="panel-heading">
        <div>
          <h2>Orders</h2>
          <p>
            Transitions are validated by the server; pickup completion records
            the customer's handover code and actual cash received.
          </p>
        </div>
      </div>
      {orders.length ? (
        <div className="admin-list">
          {orders.map(order => (
            <article className="admin-list-row" key={order.id}>
              <div>
                <strong>
                  {order.orderNumber} · {titleCase(order.status)}
                </strong>
                <p>
                  {order.fulfillmentType} · {order.paymentMethod} ·{" "}
                  {formatINR(order.totalPaise)} ·{" "}
                  {new Date(order.createdAt).toLocaleString()}
                </p>
                {order.notes && <small>Note: {order.notes}</small>}
                {order.addressSnapshot && (
                  <small>
                    Delivery address:{" "}
                    {String(
                      (order.addressSnapshot as any).line1 || "saved address"
                    )}
                  </small>
                )}
              </div>
              <div>
                <Button
                  variant="outline"
                  onClick={() =>
                    setDetailId(detailId === order.id ? null : order.id)
                  }
                >
                  {detailId === order.id
                    ? "Hide order detail"
                    : "Items & timeline"}
                </Button>
                <OrderActions
                  order={order}
                  pending={pending}
                  reason={reasonByOrder[order.id] || ""}
                  setReason={value =>
                    setReasonByOrder(current => ({
                      ...current,
                      [order.id]: value,
                    }))
                  }
                  mutate={mutate}
                />
                {detailId === order.id && (
                  <VendorOrderDetail orderId={order.id} />
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyQueue
          title="No orders to show"
          description="No orders currently belong to this vendor."
        />
      )}
    </section>
  );
}
function OrderActions({
  order,
  pending,
  reason,
  setReason,
  mutate,
}: {
  order: any;
  pending: boolean;
  reason: string;
  setReason: (value: string) => void;
  mutate: (
    orderId: number,
    status: VendorStatusAction,
    fields?: VendorOrderFields
  ) => void;
}) {
  const [handoverCode, setHandoverCode] = useState("");
  const [cashAmount, setCashAmount] = useState(
    (order.totalPaise / 100).toFixed(2)
  );
  const [cashNote, setCashNote] = useState("");
  if (order.status === "placed")
    return (
      <div className="workflow-actions">
        <Button disabled={pending} onClick={() => mutate(order.id, "accepted")}>
          Accept
        </Button>
        <input
          placeholder="Reason required to reject"
          value={reason}
          onChange={event => setReason(event.target.value)}
        />
        <Button
          variant="outline"
          disabled={pending || !reason.trim()}
          onClick={() =>
            mutate(order.id, "rejected", { reason: reason.trim() })
          }
        >
          Reject
        </Button>
      </div>
    );
  if (order.status === "accepted")
    return (
      <Button disabled={pending} onClick={() => mutate(order.id, "preparing")}>
        Start preparing
      </Button>
    );
  if (order.status === "preparing")
    return (
      <Button disabled={pending} onClick={() => mutate(order.id, "ready")}>
        Mark ready
      </Button>
    );
  if (order.status === "ready" && order.fulfillmentType === "pickup")
    return (
      <form
        className="application-form"
        onSubmit={event => {
          event.preventDefault();
          const amount = Number(cashAmount);
          if (
            !/^\d{8}$/.test(handoverCode) ||
            !Number.isFinite(amount) ||
            amount < 0
          )
            return;
          mutate(order.id, "delivered", {
            handoverCode,
            cashAmountPaise: Math.round(amount * 100),
            ...(cashNote.trim() ? { cashNote: cashNote.trim() } : {}),
          });
        }}
      >
        <label>
          Customer handover code
          <input
            inputMode="numeric"
            pattern="[0-9]{8}"
            minLength={8}
            maxLength={8}
            required
            placeholder="8-digit code"
            value={handoverCode}
            onChange={event =>
              setHandoverCode(event.target.value.replace(/\D/g, "").slice(0, 8))
            }
          />
        </label>
        <label>
          Actual cash received (₹)
          <input
            type="number"
            min="0"
            max="21474836.47"
            step="0.01"
            required
            value={cashAmount}
            onChange={event => setCashAmount(event.target.value)}
          />
        </label>
        <label>
          Cash note (optional)
          <input
            maxLength={120}
            value={cashNote}
            onChange={event => setCashNote(event.target.value)}
          />
        </label>
        <small>
          Cash differences are recorded and remain pending for admin review.
        </small>
        <Button
          type="submit"
          disabled={
            pending ||
            !/^\d{8}$/.test(handoverCode) ||
            cashAmount === "" ||
            !Number.isFinite(Number(cashAmount)) ||
            Number(cashAmount) < 0
          }
        >
          {pending ? "Recording handover…" : "Confirm pickup and cash"}
        </Button>
      </form>
    );
  if (order.status === "ready" && order.fulfillmentType === "delivery")
    return (
      <div className="workflow-actions">
        <Button
          disabled={pending}
          onClick={() => mutate(order.id, "out_for_delivery")}
        >
          Dispatch for delivery
        </Button>
      </div>
    );
  if (order.status === "out_for_delivery")
    return (
      <div className="workflow-section">
        <form
          className="application-form"
          onSubmit={event => {
            event.preventDefault();
            const amount = Number(cashAmount);
            if (
              !/^\d{8}$/.test(handoverCode) ||
              !Number.isFinite(amount) ||
              amount < 0
            )
              return;
            mutate(order.id, "delivered", {
              handoverCode,
              cashAmountPaise: Math.round(amount * 100),
              ...(cashNote.trim() ? { cashNote: cashNote.trim() } : {}),
            });
          }}
        >
          <label>
            Customer handover code
            <input
              inputMode="numeric"
              pattern="[0-9]{8}"
              minLength={8}
              maxLength={8}
              required
              placeholder="8-digit code from customer"
              value={handoverCode}
              onChange={event =>
                setHandoverCode(event.target.value.replace(/\D/g, "").slice(0, 8))
              }
            />
          </label>
          <label>
            Actual cash received (₹)
            <input
              type="number"
              min="0"
              max="21474836.47"
              step="0.01"
              required
              value={cashAmount}
              onChange={event => setCashAmount(event.target.value)}
            />
          </label>
          <label>
            Cash note (optional)
            <input
              maxLength={120}
              placeholder="Note any cash difference"
              value={cashNote}
              onChange={event => setCashNote(event.target.value)}
            />
          </label>
          <small>
            Verify the 8-digit handover code with the customer before handing over goods.
          </small>
          <Button
            type="submit"
            disabled={
              pending ||
              !/^\d{8}$/.test(handoverCode) ||
              cashAmount === "" ||
              !Number.isFinite(Number(cashAmount)) ||
              Number(cashAmount) < 0
            }
          >
            {pending ? "Recording delivery…" : "Confirm delivery and cash"}
          </Button>
        </form>
        <div className="workflow-actions" style={{ marginTop: "0.5rem" }}>
          <input
            placeholder="Reason if delivery failed"
            value={reason}
            onChange={event => setReason(event.target.value)}
          />
          <Button
            variant="outline"
            disabled={pending || !reason.trim()}
            onClick={() =>
              mutate(order.id, "failed_delivery", { reason: reason.trim() })
            }
          >
            Report delivery failure
          </Button>
        </div>
      </div>
    );
  if (order.status === "failed_delivery") {
    if (order.returnReceivedAt) {
      return (
        <div style={{ padding: "0.5rem", borderRadius: "0.375rem", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <strong style={{ fontSize: "0.85rem", color: "#334155" }}>Parcel Return Inspected</strong>
          <small style={{ display: "block", color: "#64748b" }}>
            Condition: {order.returnCondition || "Processed"} · Restocked: {order.stockRestoredAt ? "Yes" : "No (shrinkage recorded)"}
          </small>
          {order.returnNotes && <small style={{ display: "block", color: "#475569" }}>Notes: {order.returnNotes}</small>}
        </div>
      );
    }
    return <ReturnRecoveryAction order={order} />;
  }
  return <Status value={order.status} />;
}
function ReturnRecoveryAction({ order }: { order: any }) {
  const detailQuery = trpc.vendor.orderDetail.useQuery(
    { orderId: order.id },
    { enabled: !order.items }
  );
  const items: any[] = order.items ?? detailQuery.data?.items ?? [];
  const [itemDispositions, setItemDispositions] = useState<
    Record<number, { restocked: number; damaged: number; missing: number; notes: string }>
  >({});
  const [inspectionNotes, setInspectionNotes] = useState("");
  const utils = trpc.useUtils();
  const recover = trpc.vendor.recordReturnRecovery.useMutation({
    onSuccess: () => {
      toast.success("Parcel return and inventory inspection recorded.");
      utils.vendor.orders.invalidate();
      utils.vendor.orderDetail.invalidate();
    },
    onError: err => toast.error(err.message),
  });

  if (!items || items.length === 0) {
    if (detailQuery.isLoading) {
      return <small style={{ color: "#64748b" }}>Loading order items for return inspection…</small>;
    }
  }

  const getItemState = (itemId: number, maxQty: number) => {
    return (
      itemDispositions[itemId] ?? {
        restocked: maxQty,
        damaged: 0,
        missing: 0,
        notes: "",
      }
    );
  };

  const updateQuantities = (itemId: number, maxQty: number, field: "restocked" | "damaged" | "missing", val: number) => {
    const safeVal = Math.max(0, Math.min(maxQty, Math.floor(val)));
    setItemDispositions(prev => {
      const current = prev[itemId] ?? { restocked: maxQty, damaged: 0, missing: 0, notes: "" };
      const updated = { ...current, [field]: safeVal };
      if (field === "restocked") {
        const remaining = maxQty - safeVal;
        updated.damaged = Math.min(updated.damaged, remaining);
        updated.missing = remaining - updated.damaged;
      } else if (field === "damaged") {
        const remaining = maxQty - safeVal;
        updated.restocked = Math.min(updated.restocked, remaining);
        updated.missing = remaining - updated.restocked;
      } else {
        const remaining = maxQty - safeVal;
        updated.restocked = Math.min(updated.restocked, remaining);
        updated.damaged = remaining - updated.restocked;
      }
      return { ...prev, [itemId]: updated };
    });
  };

  return (
    <form
      className="application-form"
      style={{
        marginTop: "0.5rem",
        padding: "0.75rem",
        border: "1px dashed #cbd5e1",
        borderRadius: "0.5rem",
      }}
      onSubmit={e => {
        e.preventDefault();
        if (!inspectionNotes.trim() || items.length === 0) return;
        const payloadItems = items.map(line => {
          const state = getItemState(line.id, line.quantity);
          return {
            orderItemId: line.id,
            restockedQuantity: state.restocked,
            damagedQuantity: state.damaged,
            missingQuantity: state.missing,
            ...(state.notes.trim() ? { dispositionNotes: state.notes.trim() } : {}),
          };
        });
        recover.mutate({
          orderId: order.id,
          inspectionNotes: inspectionNotes.trim(),
          items: payloadItems,
        });
      }}
    >
      <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.5rem" }}>
        Step 2 & 3: Quantity-Accurate Parcel Return & Inspection
      </strong>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
        {items.map(line => {
          const state = getItemState(line.id, line.quantity);
          return (
            <div
              key={line.id}
              style={{
                padding: "0.5rem",
                borderRadius: "0.375rem",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: "0.25rem" }}>
                {line.productNameSnapshot} (Qty: {line.quantity})
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <label style={{ margin: 0, fontSize: "0.8rem", flex: 1 }}>
                  Restocked:
                  <input
                    type="number"
                    min="0"
                    max={line.quantity}
                    value={state.restocked}
                    onChange={e =>
                      updateQuantities(line.id, line.quantity, "restocked", Number(e.target.value))
                    }
                    style={{ marginTop: "0.15rem", padding: "0.25rem 0.5rem" }}
                  />
                </label>
                <label style={{ margin: 0, fontSize: "0.8rem", flex: 1 }}>
                  Damaged:
                  <input
                    type="number"
                    min="0"
                    max={line.quantity}
                    value={state.damaged}
                    onChange={e =>
                      updateQuantities(line.id, line.quantity, "damaged", Number(e.target.value))
                    }
                    style={{ marginTop: "0.15rem", padding: "0.25rem 0.5rem" }}
                  />
                </label>
                <label style={{ margin: 0, fontSize: "0.8rem", flex: 1 }}>
                  Missing:
                  <input
                    type="number"
                    min="0"
                    max={line.quantity}
                    value={state.missing}
                    onChange={e =>
                      updateQuantities(line.id, line.quantity, "missing", Number(e.target.value))
                    }
                    style={{ marginTop: "0.15rem", padding: "0.25rem 0.5rem" }}
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
      <label>
        Inspection Notes
        <input
          placeholder="Condition of returned goods"
          value={inspectionNotes}
          onChange={e => setInspectionNotes(e.target.value)}
          required
        />
      </label>
      <Button
        type="submit"
        disabled={recover.isPending || !inspectionNotes.trim() || items.length === 0}
      >
        {recover.isPending ? "Recording return…" : "Confirm parcel receipt & item inspection"}
      </Button>
    </form>
  );
}
function VendorOrderDetail({ orderId }: { orderId: number }) {
  const q = trpc.vendor.orderDetail.useQuery({ orderId }, { retry: false });
  if (q.isLoading)
    return <div className="loading-card">Loading this vendor order…</div>;
  if (q.error || !q.data)
    return (
      <div className="no-results">
        <p>{q.error?.message || "Order detail unavailable."}</p>
      </div>
    );
  const { order, items, timeline, customer } = q.data;
  const address = customer.address as Record<string, unknown> | null;
  const customerAddress = [address?.line1, address?.line2, address?.landmark]
    .filter(
      (part): part is string => typeof part === "string" && Boolean(part.trim())
    )
    .join(", ");
  return (
    <section className="workspace-panel">
      <h3>Order items & instructions</h3>
      {items.map(item => (
        <div className="checkout-item" key={item.id}>
          <span>
            {item.quantity} × {item.productNameSnapshot} ({item.unitSnapshot})
          </span>
          <strong>{formatINR(item.lineTotalPaise)}</strong>
        </div>
      ))}
      <p>
        <strong>Shop note:</strong> {order.notes || "No note"}
      </p>
      <p>
        <strong>Substitution preference:</strong>{" "}
        {order.substitutionPreference || "None provided"}
      </p>
      <h3>Customer contact</h3>
      <p>{customer.name || "Customer"}</p>
      {customer.phone ? (
        <a className="text-link" href={`tel:${customer.phone}`}>
          Call customer · {customer.phone}
        </a>
      ) : (
        <small>No customer phone was captured for this order.</small>
      )}
      {order.fulfillmentType === "delivery" && customerAddress && (
        <p>
          <strong>Delivery address:</strong> {customerAddress}
        </p>
      )}
      <h3>Timeline</h3>
      {timeline.map(event => (
        <p key={event.id}>
          <strong>{titleCase(event.toStatus)}</strong> ·{" "}
          {new Date(event.createdAt).toLocaleString()}
          {event.note ? ` · ${event.note}` : ""}
        </p>
      ))}
    </section>
  );
}
export function RiderPage({
  section = "deliveries",
}: {
  section?: "deliveries" | "register";
}) {
  return section === "register" ? (
    <RiderRegister />
  ) : (
    <AccessGate area="Rider" expected="rider">
      <RiderDesk />
    </AccessGate>
  );
}
function RiderRegister() {
  const { auth, areas, areasLoading } = useMarket();
  const status = trpc.rider.status.useQuery(undefined, {
    enabled: Boolean(auth.user),
    retry: false,
  });
  const utils = trpc.useUtils();
  const towns = areas?.towns ?? [];
  const allZones = areas?.zones ?? [];
  const [townId, setTownId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const zones = allZones.filter(z => z.townId === Number(townId));
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const register = trpc.rider.register.useMutation({
    onSuccess: async result => {
      toast.success(`Rider application ${result.status}`);
      await Promise.all([
        utils.rider.status.invalidate(),
        utils.account.me.invalidate(),
      ]);
    },
    onError: errorToast,
  });
  if (auth.loading)
    return (
      <div className="page-wrap">
        <QueryState loading />
      </div>
    );
  if (!auth.user)
    return (
      <div className="page-wrap">
        <div className="workspace-gate">
          <Bike />
          <h1>Ride for your neighbourhood.</h1>
          <p>Sign in securely to apply.</p>
          <LoginButton />
        </div>
      </div>
    );
  if (status.isLoading)
    return (
      <div className="page-wrap">
        <QueryState loading />
      </div>
    );
  if (status.error)
    return (
      <div className="page-wrap">
        <QueryState loading={false} error={status.error} />
      </div>
    );
  if (status.data)
    return (
      <div className="page-wrap">
        <Link href="/rider" className="back-link">
          <ArrowLeft /> Rider workspace
        </Link>
        <WorkspaceTitle
          eyebrow="RIDER APPLICATION"
          title="Your rider profile"
          description={`Status: ${titleCase(status.data.status)} · availability ${status.data.available ? "online" : "offline"}`}
        />
        <IntegrationNote
          title={
            status.data.status === "pending"
              ? "Awaiting admin approval"
              : "Profile exists"
          }
        >
          Delivery actions are available only when the backend confirms
          approval.
        </IntegrationNote>
      </div>
    );
  return (
    <div className="page-wrap rider-register">
      <Link href="/rider" className="back-link">
        <ArrowLeft /> Rider workspace
      </Link>
      <WorkspaceTitle
        eyebrow="RIDER APPLICATION"
        title="Ride for your neighbourhood."
        description="Rider profiles require admin approval before deliveries are available."
      />
      <form
        className="application-form"
        onSubmit={e => {
          e.preventDefault();
          register.mutate({
            townId: Number(townId),
            phone,
            ...(vehicleType ? { vehicleType } : {}),
          });
        }}
      >
        <label>
          Town
          <select
            required
            value={townId}
            onChange={e => {
              setTownId(e.target.value);
              setZoneId("");
            }}
          >
            <option value="">Choose active town</option>
            {towns.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}, {t.state}
              </option>
            ))}
          </select>
        </label>
        <label>
          Service zone
          <select
            required
            value={zoneId}
            disabled={!townId || !zones.length}
            onChange={e => setZoneId(e.target.value)}
          >
            <option value="">
              {!townId
                ? "Choose a town first"
                : zones.length
                  ? "Choose service zone"
                  : "No active zones in this town"}
            </option>
            {zones.map(z => (
              <option key={z.id} value={z.id}>
                {z.locality}
                {z.postalCode ? ` · ${z.postalCode}` : ""} — {z.name}
              </option>
            ))}
          </select>
        </label>
        <small>
          The active service zone helps you select your operating area; the
          current rider endpoint persists town only.
        </small>
        <label>
          Phone
          <input
            required
            type="tel"
            minLength={5}
            maxLength={30}
            value={phone}
            onChange={e => setPhone(e.target.value)}
          />
        </label>
        <label>
          Vehicle type
          <input
            maxLength={60}
            value={vehicleType}
            onChange={e => setVehicleType(e.target.value)}
          />
        </label>
        {!towns.length && (
          <IntegrationNote title="No active towns">
            Ask an administrator to activate a town and add a service zone
            before registering.
          </IntegrationNote>
        )}
        <Button
          disabled={register.isPending || areasLoading || !townId || !zoneId}
        >
          Submit rider application
        </Button>
      </form>
    </div>
  );
}
function RiderDesk() {
  const q = trpc.rider.deliveries.useQuery(undefined, { retry: false });
  const status = trpc.rider.status.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [eventNotes, setEventNotes] = useState<Record<number, string>>({});
  const [handoverCodes, setHandoverCodes] = useState<Record<number, string>>(
    {}
  );
  const [cashAmounts, setCashAmounts] = useState<Record<number, string>>({});
  const [cashNotes, setCashNotes] = useState<Record<number, string>>({});
  const refresh = async () => {
    await Promise.all([
      utils.rider.deliveries.invalidate(),
      utils.rider.status.invalidate(),
    ]);
  };
  const availability = trpc.rider.setAvailability.useMutation({
    onSuccess: refresh,
    onError: errorToast,
  });
  const update = trpc.rider.updateDelivery.useMutation({
    onSuccess: async result => {
      if (result.cashRecorded && !result.cashCollected)
        toast.warning(
          "Delivery completed; the cash difference is recorded and remains pending admin review."
        );
      else
        toast.success(
          result.cashCollected
            ? "Delivery completed and exact cash recorded"
            : "Delivery status updated"
        );
      await refresh();
    },
    onError: errorToast,
  });
  if (q.isLoading || status.isLoading)
    return (
      <WorkspaceLayout title="Rider" caption="DELIVERY DESK" nav={riderNav}>
        <div className="workspace-main">
          <QueryState loading />
        </div>
      </WorkspaceLayout>
    );
  return (
    <WorkspaceLayout
      title="Rider"
      caption="DELIVERY DESK"
      nav={riderNav}
      className="rider-workspace"
    >
      <div className="workspace-main">
        <WorkspaceTitle
          eyebrow="RIDER DESK"
          title="Your deliveries"
          description="Assigned delivery records, pickup/drop-off contacts, and directions. No live GPS tracking is shown."
        />
        {q.error || status.error ? (
          <QueryState loading={false} error={q.error || status.error} />
        ) : (
          <>
            <div className="rider-availability">
              <div>
                <span
                  className={
                    status.data?.available ? "status-dot on" : "status-dot"
                  }
                />
                <div>
                  <strong>
                    {status.data?.available ? "Online" : "Offline"}
                  </strong>
                  <small>Availability is stored by the rider service.</small>
                </div>
              </div>
              <Button
                variant="outline"
                disabled={availability.isPending}
                onClick={() =>
                  availability.mutate({ available: !status.data?.available })
                }
              >
                {status.data?.available ? "Go offline" : "Go online"}
              </Button>
            </div>
            {q.data?.length ? (
              <div className="admin-list">
                {q.data.map(({ assignment, order, shop, customer, active }) => {
                  if (!active || !shop || !customer)
                    return (
                      <article className="workspace-panel" key={assignment.id}>
                        <div className="panel-heading">
                          <div>
                            <h2>{order.orderNumber}</h2>
                            <p>
                              Order {titleCase(order.status)} · assignment{" "}
                              {titleCase(assignment.status)} ·{" "}
                              {formatINR(order.totalPaise)}
                            </p>
                          </div>
                          <Status value={assignment.status} />
                        </div>
                        <IntegrationNote title="Assignment ended">
                          Contact details are hidden for completed, declined,
                          failed, or cancelled assignments.
                        </IntegrationNote>
                      </article>
                    );
                  const address = customer.address as Record<
                    string,
                    unknown
                  > | null;
                  const dropoff = [
                    address?.line1,
                    address?.line2,
                    address?.landmark,
                    address?.postalCode,
                  ]
                    .filter(
                      (part): part is string =>
                        typeof part === "string" && Boolean(part.trim())
                    )
                    .join(", ");
                  const pickup = [shop.address, shop.locality, shop.town]
                    .filter(Boolean)
                    .join(", ");
                  const pickupDirections = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pickup)}`;
                  const dropoffDirections = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dropoff)}`;
                  const eventNote = eventNotes[assignment.id] || "";
                  const code = handoverCodes[assignment.id] || "";
                  const cash =
                    cashAmounts[assignment.id] ??
                    (order.totalPaise / 100).toFixed(2);
                  const amount = Number(cash);
                  const validCash =
                    /^\d+(?:\.\d{1,2})?$/.test(cash) &&
                    Number.isFinite(amount) &&
                    amount >= 0 &&
                    amount <= 21474836.47;
                  return (
                    <article className="workspace-panel" key={assignment.id}>
                      <div className="panel-heading">
                        <div>
                          <h2>{order.orderNumber}</h2>
                          <p>
                            {order.fulfillmentType} · {titleCase(order.status)}{" "}
                            · {formatINR(order.totalPaise)}
                          </p>
                        </div>
                        <Status value={assignment.status} />
                      </div>
                      <section className="route-contact">
                        <h3>Collect from {shop.name}</h3>
                        <p>{pickup}</p>
                        {shop.phone && (
                          <a className="text-link" href={`tel:${shop.phone}`}>
                            Call shop · {shop.phone}
                          </a>
                        )}
                        <a
                          className="text-link"
                          href={pickupDirections}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open pickup directions in Maps
                        </a>
                      </section>
                      <section className="route-contact">
                        <h3>Deliver to {customer.name || "Customer"}</h3>
                        <p>{dropoff || "No delivery address snapshot"}</p>
                        {customer.phone && (
                          <a
                            className="text-link"
                            href={`tel:${customer.phone}`}
                          >
                            Call customer · {customer.phone}
                          </a>
                        )}
                        {dropoff && (
                          <a
                            className="text-link"
                            href={dropoffDirections}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open drop-off directions in Maps
                          </a>
                        )}
                      </section>
                      {order.notes && (
                        <p>
                          <strong>Customer delivery note:</strong> {order.notes}
                        </p>
                      )}
                      <p>
                        Payment method {order.paymentMethod}; status{" "}
                        {order.paymentStatus}.
                      </p>
                      {assignment.status === "picked_up" && (
                        <IntegrationNote title="Customer handover code">
                          Ask the signed-in customer to show the 8-digit code
                          from their order page. No SMS is sent. Record the
                          actual cash amount received; any mismatch remains
                          pending for admin review.
                        </IntegrationNote>
                      )}
                      {["accepted", "arrived", "picked_up"].includes(
                        assignment.status
                      ) && (
                        <label className="field-label">
                          Rider event note
                          {assignment.status !== "picked_up" && (
                            <small>Required to record arrival or pickup.</small>
                          )}
                          <input
                            value={eventNote}
                            onChange={event =>
                              setEventNotes(previous => ({
                                ...previous,
                                [assignment.id]: event.target.value,
                              }))
                            }
                            placeholder="Context for arrival, pickup or failed delivery"
                          />
                        </label>
                      )}
                      {assignment.status === "picked_up" && (
                        <div className="application-form">
                          <label>
                            Customer handover code
                            <input
                              inputMode="numeric"
                              pattern="[0-9]{8}"
                              minLength={8}
                              maxLength={8}
                              required
                              value={code}
                              onChange={event =>
                                setHandoverCodes(previous => ({
                                  ...previous,
                                  [assignment.id]: event.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 8),
                                }))
                              }
                            />
                          </label>
                          <label>
                            Actual cash received (₹)
                            <input
                              type="number"
                              min="0"
                              max="21474836.47"
                              step="0.01"
                              required
                              value={cash}
                              onChange={event =>
                                setCashAmounts(previous => ({
                                  ...previous,
                                  [assignment.id]: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            Cash note (optional)
                            <input
                              maxLength={120}
                              value={cashNotes[assignment.id] || ""}
                              onChange={event =>
                                setCashNotes(previous => ({
                                  ...previous,
                                  [assignment.id]: event.target.value,
                                }))
                              }
                            />
                          </label>
                        </div>
                      )}
                      <div className="workflow-actions">
                        {assignment.status === "assigned" && (
                          <>
                            <Button
                              disabled={update.isPending}
                              onClick={() =>
                                update.mutate({
                                  assignmentId: assignment.id,
                                  action: "accept",
                                })
                              }
                            >
                              Accept
                            </Button>
                            <Button
                              variant="outline"
                              disabled={update.isPending}
                              onClick={() =>
                                update.mutate({
                                  assignmentId: assignment.id,
                                  action: "decline",
                                })
                              }
                            >
                              Decline
                            </Button>
                          </>
                        )}
                        {assignment.status === "accepted" && (
                          <Button
                            disabled={update.isPending || !eventNote.trim()}
                            onClick={() =>
                              update.mutate({
                                assignmentId: assignment.id,
                                action: "arrived",
                                proof: eventNote.trim(),
                              })
                            }
                          >
                            Record arrival
                          </Button>
                        )}
                        {assignment.status === "arrived" && (
                          <Button
                            disabled={update.isPending || !eventNote.trim()}
                            onClick={() =>
                              update.mutate({
                                assignmentId: assignment.id,
                                action: "picked_up",
                                proof: eventNote.trim(),
                              })
                            }
                          >
                            Confirm pickup
                          </Button>
                        )}
                        {assignment.status === "picked_up" && (
                          <>
                            <Button
                              disabled={
                                update.isPending ||
                                !/^\d{8}$/.test(code) ||
                                !validCash
                              }
                              onClick={() =>
                                update.mutate({
                                  assignmentId: assignment.id,
                                  action: "delivered",
                                  handoverCode: code,
                                  cashAmountPaise: Math.round(amount * 100),
                                  ...(cashNotes[assignment.id]?.trim()
                                    ? {
                                        cashNote:
                                          cashNotes[assignment.id].trim(),
                                      }
                                    : {}),
                                })
                              }
                            >
                              {update.isPending
                                ? "Recording handover…"
                                : "Confirm delivery and cash"}
                            </Button>
                            <Button
                              variant="outline"
                              disabled={update.isPending || !eventNote.trim()}
                              onClick={() =>
                                update.mutate({
                                  assignmentId: assignment.id,
                                  action: "failed",
                                  proof: eventNote.trim(),
                                })
                              }
                            >
                              Report failed delivery
                            </Button>
                          </>
                        )}
                      </div>
                      {update.error && (
                        <p role="alert">{update.error.message}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <EmptyQueue
                title="No assigned deliveries"
                description="No assignments have been made to this rider."
              />
            )}
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}

export function AdminPage({
  section = "overview",
}: {
  section?:
    | "overview"
    | "vendors"
    | "orders"
    | "riders"
    | "categories"
    | "support"
    | "settings";
}) {
  return (
    <AccessGate area="Admin" expected="admin">
      <AdminDesk section={section} />
    </AccessGate>
  );
}
function AdminDesk({
  section,
}: {
  section:
    | "overview"
    | "vendors"
    | "orders"
    | "riders"
    | "categories"
    | "support"
    | "settings";
}) {
  const [filter, setFilter] = useState("all");
  const [vendorId, setVendorId] = useState("");
  const [riderId, setRiderId] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [catName, setCatName] = useState("");
  const [catSlug, setCatSlug] = useState("");
  const [catIcon, setCatIcon] = useState("");
  const [catDescription, setCatDescription] = useState("");
  const dashboard = trpc.admin.dashboard.useQuery(undefined, {
    enabled: section === "overview",
    retry: false,
  });
  const vendors = trpc.admin.vendors.useQuery(
    filter === "all" ? undefined : { status: filter as any },
    { enabled: section === "vendors" || section === "overview", retry: false }
  );
  const orders = trpc.admin.orders.useQuery(undefined, {
    enabled: section === "orders" || section === "overview",
    retry: false,
  });
  const riders = trpc.admin.riders.useQuery(undefined, {
    enabled: section === "riders" || section === "orders",
    retry: false,
  });
  const categories = trpc.admin.categories.useQuery(undefined, {
    enabled: section === "categories",
    retry: false,
  });
  const settings = trpc.admin.settings.useQuery(undefined, {
    enabled: section === "settings",
    retry: false,
  });
  const settingsVendors = trpc.admin.vendors.useQuery(undefined, {
    enabled: section === "settings",
    retry: false,
  });
  const utils = trpc.useUtils();
  const refresh = async () => {
    await Promise.all([
      utils.admin.dashboard.invalidate(),
      utils.admin.vendors.invalidate(),
      utils.admin.orders.invalidate(),
      utils.admin.riders.invalidate(),
      utils.admin.categories.invalidate(),
      utils.admin.settings.invalidate(),
    ]);
  };
  const reviewVendor = trpc.admin.reviewVendor.useMutation({
    onSuccess: refresh,
    onError: errorToast,
  });
  const reviewRider = trpc.admin.reviewRider.useMutation({
    onSuccess: refresh,
    onError: errorToast,
  });
  const statusMutation = trpc.admin.updateOrderStatus.useMutation({
    onSuccess: refresh,
    onError: errorToast,
  });
  const assign = trpc.admin.assignRider.useMutation({
    onSuccess: async () => {
      toast.success("Rider assigned");
      await refresh();
    },
    onError: errorToast,
  });
  const createCategory = trpc.admin.createCategory.useMutation({
    onSuccess: async () => {
      toast.success("Category created");
      setCatName("");
      setCatSlug("");
      await refresh();
    },
    onError: errorToast,
  });
  const saveSetting = trpc.admin.updateSettings.useMutation({
    onSuccess: async () => {
      toast.success("Setting saved");
      await utils.admin.settings.invalidate();
    },
    onError: errorToast,
  });
  const createTown = trpc.admin.createTown.useMutation({
    onSuccess: async () => {
      toast.success("Town created");
      await Promise.all([
        utils.admin.settings.invalidate(),
        utils.marketplace.areas.invalidate(),
      ]);
    },
    onError: errorToast,
  });
  const setTownActive = trpc.admin.setTownActive.useMutation({
    onSuccess: async () => {
      toast.success("Town status updated");
      await Promise.all([
        utils.admin.settings.invalidate(),
        utils.marketplace.areas.invalidate(),
        utils.marketplace.home.invalidate(),
        utils.marketplace.search.invalidate(),
        utils.marketplace.shop.invalidate(),
        utils.marketplace.product.invalidate(),
      ]);
    },
    onError: errorToast,
  });
  const createZone = trpc.admin.createServiceZone.useMutation({
    onSuccess: async () => {
      toast.success("Service zone created");
      await Promise.all([
        utils.admin.settings.invalidate(),
        utils.marketplace.areas.invalidate(),
        utils.marketplace.home.invalidate(),
        utils.marketplace.search.invalidate(),
      ]);
    },
    onError: errorToast,
  });
  const setZoneActive = trpc.admin.setZoneActive.useMutation({
    onSuccess: async () => {
      toast.success("Service-zone status updated");
      await Promise.all([
        utils.admin.settings.invalidate(),
        utils.marketplace.areas.invalidate(),
        utils.marketplace.home.invalidate(),
        utils.marketplace.search.invalidate(),
        utils.marketplace.shop.invalidate(),
        utils.marketplace.product.invalidate(),
      ]);
    },
    onError: errorToast,
  });
  const updateTerms = trpc.admin.updateVendorTerms.useMutation({
    onSuccess: async () => {
      toast.success("Vendor terms saved");
      await Promise.all([
        utils.admin.vendors.invalidate(),
        utils.admin.settings.invalidate(),
        utils.admin.dashboard.invalidate(),
        utils.marketplace.home.invalidate(),
        utils.marketplace.search.invalidate(),
        utils.marketplace.shop.invalidate(),
        utils.marketplace.product.invalidate(),
      ]);
    },
    onError: errorToast,
  });
  const titles: Record<string, [string, string, string]> = {
    overview: [
      "PLATFORM CONTROL",
      "Town at a glance",
      "Live marketplace metrics from stored records.",
    ],
    vendors: [
      "MERCHANT OPERATIONS",
      "Vendor applications",
      "Review real applications and vendor status.",
    ],
    orders: [
      "ORDER OPERATIONS",
      "Orders & assignment",
      "Filter order records and manually assign eligible riders.",
    ],
    riders: [
      "DELIVERY OPERATIONS",
      "Rider accounts",
      "Review registered riders.",
    ],
    categories: [
      "CATALOGUE",
      "Market categories",
      "Add enabled categories; editing existing categories is not provided by this API.",
    ],
    support: [
      "CUSTOMER CARE",
      "Support inbox",
      "Private customer conversations and audited admin replies.",
    ],
    settings: [
      "CONFIGURATION",
      "Marketplace settings",
      "Manage service coverage, vendor terms, and persisted platform settings.",
    ],
  };
  const [eyebrow, title, description] = titles[section];
  const errors = [
    dashboard.error,
    vendors.error,
    orders.error,
    riders.error,
    categories.error,
    settings.error,
    settingsVendors.error,
  ].filter(Boolean);
  const loading = [
    dashboard.isLoading,
    vendors.isLoading,
    orders.isLoading,
    riders.isLoading,
    categories.isLoading,
    settings.isLoading,
    settingsVendors.isLoading,
  ].some(Boolean);
  return (
    <WorkspaceLayout
      title="Admin"
      caption="MARKETPLACE CONTROL"
      nav={adminNav}
      className="admin-workspace"
    >
      <div className="workspace-main">
        <WorkspaceTitle
          eyebrow={eyebrow}
          title={title}
          description={description}
        />
        {loading && <QueryState loading />}
        {errors.length > 0 && <QueryState loading={false} error={errors[0]} />}
        {!loading && !errors.length && (
          <>
            {section === "overview" && dashboard.data && (
              <>
                <div className="metric-grid admin-metrics">
                  <Metric
                    label="Customer profiles"
                    value={String(dashboard.data.customers)}
                    icon={Users}
                  />
                  <Metric
                    label="Active vendors"
                    value={String(dashboard.data.activeVendors)}
                    icon={Store}
                  />
                  <Metric
                    label="Pending vendors"
                    value={String(dashboard.data.pendingVendors)}
                    icon={Store}
                  />
                  <Metric
                    label="Orders today"
                    value={String(dashboard.data.ordersToday)}
                    icon={ClipboardList}
                  />
                  <Metric
                    label="Delivered GMV"
                    value={formatINR(dashboard.data.gmvPaise)}
                    icon={WalletCards}
                  />
                  <Metric
                    label="Commission"
                    value={formatINR(dashboard.data.commissionPaise)}
                    icon={WalletCards}
                  />
                  <Metric
                    label="Pending deliveries"
                    value={String(dashboard.data.pendingDeliveries)}
                    icon={Truck}
                  />
                  <Metric
                    label="Cancellations"
                    value={String(dashboard.data.cancellations)}
                    icon={CircleHelp}
                  />
                  <Metric
                    label="Pending riders"
                    value={String(dashboard.data.pendingRiders)}
                    icon={Bike}
                  />
                </div>
                <CashReconciliationPanel />
                <IntegrationNote title="Settlements and delivery-fee totals aren't returned">
                  Those metrics are omitted rather than fabricated.
                </IntegrationNote>
                <Link href="/admin/vendors" className="text-link">
                  Review vendors <ArrowRight />
                </Link>
                <Link href="/admin/orders" className="text-link">
                  Manage orders <ArrowRight />
                </Link>
              </>
            )}
            {section === "vendors" && (
              <section className="workspace-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Vendor applications</h2>
                    <p>
                      Approval, rejection and suspension decisions are audited
                      by the server.
                    </p>
                  </div>
                  <select
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    {["pending", "approved", "rejected", "suspended"].map(s => (
                      <option key={s} value={s}>
                        {titleCase(s)}
                      </option>
                    ))}
                  </select>
                </div>
                {vendors.data?.length ? (
                  <div className="admin-list">
                    {vendors.data.map(
                      ({ vendor, ownerName, ownerEmail, locality }) => (
                        <article className="admin-list-row" key={vendor.id}>
                          <div>
                            <strong>
                              {vendor.shopName} · {titleCase(vendor.status)}
                            </strong>
                            <p>
                              {ownerName || "Owner"} · {ownerEmail || ""} ·{" "}
                              {locality}
                            </p>
                            <small>
                              {vendor.address} · {vendor.phone || "No phone"}
                            </small>
                          </div>
                          <div className="workflow-actions">
                            {["approved", "rejected", "suspended"].map(
                              decision => (
                                <Button
                                  key={decision}
                                  variant={
                                    decision === "approved"
                                      ? "default"
                                      : "outline"
                                  }
                                  disabled={reviewVendor.isPending}
                                  onClick={() => {
                                    const why =
                                      decision === "approved"
                                        ? undefined
                                        : window.prompt(
                                            `Reason for ${decision} (optional)`
                                          ) || undefined;
                                    reviewVendor.mutate({
                                      vendorId: vendor.id,
                                      decision: decision as any,
                                      ...(why ? { reason: why } : {}),
                                    });
                                  }}
                                >
                                  {titleCase(decision)}
                                </Button>
                              )
                            )}
                          </div>
                        </article>
                      )
                    )}
                  </div>
                ) : (
                  <EmptyQueue
                    title="No matching applications"
                    description="The backend returned no vendor records for this status filter."
                  />
                )}
              </section>
            )}
            {section === "orders" && (
              <>
                <CashReconciliationPanel />
                <AdminOrders
                  orders={orders.data ?? []}
                  riders={riders.data ?? []}
                  assign={(orderId, riderId) =>
                    assign.mutate({ orderId, riderId })
                  }
                  update={(orderId, status, reason) =>
                    statusMutation.mutate({ orderId, status, reason })
                  }
                  assigning={assign.isPending}
                />
              </>
            )}
            {section === "riders" && (
              <section className="workspace-panel">
                <h2>Rider applications</h2>
                {riders.data?.length ? (
                  <div className="admin-list">
                    {riders.data.map(({ rider, name, email }) => (
                      <article className="admin-list-row" key={rider.id}>
                        <div>
                          <strong>
                            {name || "Rider"} · {titleCase(rider.status)}
                          </strong>
                          <p>
                            {email} · {rider.phone} · town {rider.townId}
                          </p>
                          <small>
                            Availability:{" "}
                            {rider.available ? "online" : "offline"}
                          </small>
                        </div>
                        <div className="workflow-actions">
                          {["approved", "rejected", "suspended"].map(
                            decision => (
                              <Button
                                key={decision}
                                variant={
                                  decision === "approved"
                                    ? "default"
                                    : "outline"
                                }
                                onClick={() =>
                                  reviewRider.mutate({
                                    riderId: rider.id,
                                    decision: decision as any,
                                  })
                                }
                              >
                                {titleCase(decision)}
                              </Button>
                            )
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyQueue
                    title="No rider profiles"
                    description="No riders are currently registered."
                  />
                )}
              </section>
            )}
            {section === "categories" && (
              <section className="workspace-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Categories</h2>
                    <p>
                      Regulated categories may be created disabled; no API
                      exists to edit existing category records.
                    </p>
                  </div>
                </div>
                <form
                  className="application-form"
                  onSubmit={e => {
                    e.preventDefault();
                    createCategory.mutate({
                      slug: catSlug,
                      name: catName,
                      ...(catIcon ? { icon: catIcon } : {}),
                      ...(catDescription
                        ? { description: catDescription }
                        : {}),
                    });
                  }}
                >
                  <label>
                    Name
                    <input
                      required
                      maxLength={120}
                      value={catName}
                      onChange={e => setCatName(e.target.value)}
                    />
                  </label>
                  <label>
                    Slug (lowercase letters, numbers and hyphens)
                    <input
                      required
                      pattern="[a-z0-9-]+"
                      maxLength={96}
                      value={catSlug}
                      onChange={e => setCatSlug(e.target.value)}
                    />
                  </label>
                  <label>
                    Icon label (optional)
                    <input
                      maxLength={80}
                      value={catIcon}
                      onChange={e => setCatIcon(e.target.value)}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      maxLength={1000}
                      value={catDescription}
                      onChange={e => setCatDescription(e.target.value)}
                    />
                  </label>
                  <Button disabled={createCategory.isPending}>
                    <Plus /> Create category
                  </Button>
                </form>
                {categories.data?.length ? (
                  <div className="category-admin-list">
                    {categories.data.map(c => (
                      <div key={c.id}>
                        <span>
                          <Boxes />
                          {c.name}
                        </span>
                        <small>
                          {c.slug} · {c.enabled ? "enabled" : "disabled"} ·{" "}
                          {c.regulated ? "regulated" : "general"}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyQueue
                    title="No categories"
                    description="The category query returned no rows."
                  />
                )}
              </section>
            )}
            {section === "support" && <AdminSupportPanel />}
            {section === "settings" && settings.data && (
              <SettingsPanel
                data={settings.data}
                vendors={settingsVendors.data ?? []}
                save={(key, value) => saveSetting.mutate({ key, value })}
                saving={saveSetting.isPending}
                createTown={input => createTown.mutate(input)}
                creatingTown={createTown.isPending}
                toggleTown={(townId, active) =>
                  setTownActive.mutate({ townId, active })
                }
                creatingZone={createZone.isPending}
                createZone={input => createZone.mutate(input)}
                toggleZone={(zoneId, active) =>
                  setZoneActive.mutate({ zoneId, active })
                }
                updateTerms={input => updateTerms.mutate(input)}
                termsSaving={updateTerms.isPending}
              />
            )}
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
function AdminSupportPanel() {
  const [filter, setFilter] = useState<"all" | "open" | "in_progress" | "resolved" | "closed">("open");
  const [selectedId, setSelectedId] = useState<number | undefined>();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"in_progress" | "resolved" | "closed">("in_progress");
  const utils = trpc.useUtils();
  const tickets = trpc.admin.supportTickets.useQuery(
    filter === "all" ? undefined : { status: filter },
    { retry: false }
  );
  const thread = trpc.admin.supportThread.useQuery(
    { ticketId: selectedId ?? -1 },
    { enabled: Boolean(selectedId), retry: false }
  );
  useEffect(() => {
    const rows = tickets.data ?? [];
    if (!rows.some(row => row.ticket.id === selectedId))
      setSelectedId(rows[0]?.ticket.id);
  }, [tickets.data, selectedId]);
  useEffect(() => {
    const next = thread.data?.ticket.status;
    if (next === "in_progress" || next === "resolved" || next === "closed") setStatus(next);
    else setStatus("in_progress");
  }, [thread.data?.ticket.id, thread.data?.ticket.status]);
  const reply = trpc.admin.replySupport.useMutation({
    onSuccess: async () => {
      setMessage("");
      toast.success("Support reply saved");
      await Promise.all([
        utils.admin.supportTickets.invalidate(),
        ...(selectedId ? [utils.admin.supportThread.invalidate({ ticketId: selectedId })] : []),
      ]);
    },
    onError: errorToast,
  });
  const active = thread.data?.ticket;
  return (
    <div className="workspace-panel">
      <div className="panel-heading">
        <div><h2>Customer support tickets</h2><p>Customer identity and messages are visible only to administrators and the ticket owner.</p></div>
        <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)} aria-label="Filter support tickets">
          {["all", "open", "in_progress", "resolved", "closed"].map(value => <option key={value} value={value}>{titleCase(value)}</option>)}
        </select>
      </div>
      <IntegrationNote title="In-app support only">Replies are saved in the ticket thread. Email and SMS notifications are not connected.</IntegrationNote>
      <QueryState loading={tickets.isLoading} error={tickets.error}>
        {tickets.data?.length ? (
          <div className="admin-support-grid">
            <div className="admin-list">
              {tickets.data.map(row => <button type="button" key={row.ticket.id} className={`admin-list-row support-ticket-select${row.ticket.id === selectedId ? " selected" : ""}`} onClick={() => setSelectedId(row.ticket.id)}>
                <span><strong>{row.ticket.ticketNumber} · {row.ticket.subject}</strong><small>{row.customerName || "Customer"} · {titleCase(row.ticket.status)}{row.orderNumber ? ` · ${row.orderNumber}` : ""}</small></span>
                <MessageSquareText aria-hidden="true" />
              </button>)}
            </div>
            {selectedId && <section className="support-admin-thread" aria-live="polite">
              <QueryState loading={thread.isLoading} error={thread.error}>
                {active && <>
                  <h3>{active.subject}</h3>
                  <p>{thread.data?.customerName || "Customer"} · {thread.data?.customerEmail || ""}{thread.data?.orderNumber ? ` · ${thread.data.orderNumber}` : ""}</p>
                  <div className="support-thread">{thread.data?.messages.map(entry => <article className="support-message" key={entry.id}>
                    <div><strong>{titleCase(entry.senderRole)}</strong><small>{new Date(entry.createdAt).toLocaleString()}</small></div>
                    <p>{entry.message}</p>
                  </article>)}</div>
                  <form className="application-form" onSubmit={event => { event.preventDefault(); reply.mutate({ ticketId: selectedId, message: message.trim(), status }); }}>
                    <label>Admin reply<textarea required minLength={1} maxLength={10000} rows={4} value={message} onChange={event => setMessage(event.target.value)} /></label>
                    <label>Ticket status<select value={status} onChange={event => setStatus(event.target.value as typeof status)}>
                      {["in_progress", "resolved", "closed"].map(value => <option key={value} value={value}>{titleCase(value)}</option>)}
                    </select></label>
                    <Button type="submit" disabled={reply.isPending || !message.trim()}><Send /> {reply.isPending ? "Saving…" : "Reply and update status"}</Button>
                    {reply.error && <p role="alert">{reply.error.message}</p>}
                  </form>
                </>}
              </QueryState>
            </section>}
          </div>
        ) : tickets.data ? <EmptyState icon={MessageSquareText} title="No tickets in this queue">There are no support tickets for this status.</EmptyState> : null}
      </QueryState>
    </div>
  );
}

function CashReconciliationPanel() {
  const query = trpc.admin.cashCollections.useQuery(undefined, {
    retry: false,
  });
  const utils = trpc.useUtils();
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [reasons, setReasons] = useState<Record<number, string>>({});
  const [historyOrderId, setHistoryOrderId] = useState<number | null>(null);
  const reconcile = trpc.admin.reconcileCashCollection.useMutation({
    onSuccess: async (result, variables) => {
      if (result.collected)
        toast.success("Verified amount matches; payment marked collected");
      else
        toast.warning(
          "Verified amount differs from expected; payment remains pending for review."
        );
      setReasons(current => ({ ...current, [variables.orderId]: "" }));
      await Promise.all([
        utils.admin.cashCollections.invalidate(),
        utils.admin.orders.invalidate(),
        utils.admin.dashboard.invalidate(),
      ]);
    },
    onError: errorToast,
  });
  return (
    <section className="workspace-panel">
      <div className="panel-heading">
        <div>
          <h2>Cash reconciliation</h2>
          <p>
            Review a collector's reported amount against the order total. Only
            exact verified amounts mark payment collected; discrepancies remain
            pending admin review.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <QueryState loading={query.isLoading} error={query.error}>
        {query.data?.length ? (
          <div className="admin-list">
            {query.data.map(row => {
              const reported = row.payment.collectedAmountPaise;
              const reportExists = Boolean(row.payment.recordedAt);
              const verified =
                row.payment.status === "collected"
                  ? row.payment.collectedAmountPaise
                  : null;
              const amount =
                amounts[row.orderId] ??
                (reported === null ? "" : (reported / 100).toFixed(2));
              const reason = reasons[row.orderId] || "";
              const completed = row.orderStatus === "delivered";
              const canReview =
                reportExists &&
                completed &&
                row.payment.status !== "collected" &&
                !["voided", "refunded"].includes(row.payment.status);
              return (
                <article className="admin-list-row" key={row.orderId}>
                  <div>
                    <strong>
                      {row.orderNumber} · {row.shopName}
                    </strong>
                    <p>
                      Order {titleCase(row.orderStatus)} ·{" "}
                      {titleCase(row.payment.method)} · payment{" "}
                      {titleCase(row.payment.status)}
                    </p>
                    <small>
                      Expected: {formatINR(row.expectedPaise)} · Amount
                      currently recorded:{" "}
                      {reportExists && reported !== null
                        ? formatINR(reported)
                        : "No amount reported"}{" "}
                      · Admin verified:{" "}
                      {verified !== null
                        ? formatINR(verified)
                        : "Not marked collected"}
                    </small>
                    {row.payment.recordedAt && (
                      <small>
                        Reported{" "}
                        {new Date(row.payment.recordedAt).toLocaleString()}
                        {row.payment.reference
                          ? ` · Note/reference: ${row.payment.reference}`
                          : ""}
                      </small>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setHistoryOrderId(current =>
                        current === row.orderId ? null : row.orderId
                      )
                    }
                  >
                    {historyOrderId === row.orderId
                      ? "Hide report history"
                      : "Reported & verified amounts"}
                  </Button>
                  {canReview ? (
                    <form
                      className="application-form"
                      onSubmit={event => {
                        event.preventDefault();
                        const numeric = Number(amount);
                        if (
                          !Number.isFinite(numeric) ||
                          numeric < 0 ||
                          !reason.trim() ||
                          reason.trim().length < 8
                        )
                          return;
                        reconcile.mutate({
                          orderId: row.orderId,
                          verifiedAmountPaise: Math.round(numeric * 100),
                          reason: reason.trim(),
                        });
                      }}
                    >
                      <label>
                        Amount verified by admin (₹)
                        <input
                          type="number"
                          min="0"
                          max="21474836.47"
                          step="0.01"
                          required
                          value={amount}
                          onChange={event =>
                            setAmounts(current => ({
                              ...current,
                              [row.orderId]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Review reason (at least 8 characters)
                        <textarea
                          required
                          minLength={8}
                          maxLength={500}
                          value={reason}
                          onChange={event =>
                            setReasons(current => ({
                              ...current,
                              [row.orderId]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <Button
                        disabled={
                          reconcile.isPending ||
                          amount === "" ||
                          !Number.isFinite(Number(amount)) ||
                          Number(amount) < 0 ||
                          reason.trim().length < 8
                        }
                      >
                        {reconcile.isPending
                          ? "Saving review…"
                          : "Save admin review"}
                      </Button>
                    </form>
                  ) : (
                    <Status
                      value={
                        row.payment.status === "collected"
                          ? "collected"
                          : !reportExists
                            ? "awaiting_cash_report"
                            : !completed
                              ? "awaiting_order_completion"
                              : row.payment.status === "voided" ||
                                  row.payment.status === "refunded"
                                ? row.payment.status
                                : "pending_admin_review"
                      }
                    />
                  )}
                  {historyOrderId === row.orderId && (
                    <CashCollectionHistory
                      orderId={row.orderId}
                      expectedPaise={row.expectedPaise}
                    />
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyQueue
            title="No cash records"
            description="Cash payment records will appear here after an order is created."
          />
        )}
      </QueryState>
      {reconcile.error && <p role="alert">{reconcile.error.message}</p>}
    </section>
  );
}
function CashCollectionHistory({
  orderId,
  expectedPaise,
}: {
  orderId: number;
  expectedPaise: number;
}) {
  const query = trpc.admin.orderDetail.useQuery({ orderId }, { retry: false });
  if (query.isLoading)
    return <div className="loading-card">Loading cash report history…</div>;
  if (query.error || !query.data)
    return (
      <div className="no-results">
        <p>{query.error?.message || "Cash report history unavailable."}</p>
      </div>
    );
  const cashReports = query.data.timeline.filter(
    event =>
      event.toStatus === "cash_collected" || event.toStatus === "cash_variance"
  );
  const reviews = query.data.timeline.filter(
    event =>
      event.toStatus === "cash_reconciled" ||
      event.toStatus === "cash_variance_reviewed"
  );
  return (
    <section className="workspace-panel">
      <h3>Cash report and admin review history</h3>
      <p>Expected at order completion: {formatINR(expectedPaise)}</p>
      {cashReports.length ? (
        cashReports.map(event => {
          const metadata = event.metadata as Record<string, unknown> | null;
          const reportedPaise = Number(metadata?.collectedPaise);
          return (
            <p key={event.id}>
              <strong>Collector reported:</strong>{" "}
              {Number.isFinite(reportedPaise)
                ? formatINR(reportedPaise)
                : "Amount unavailable"}{" "}
              · {new Date(event.createdAt).toLocaleString()}
              {event.note ? ` · ${event.note}` : ""}
            </p>
          );
        })
      ) : (
        <p>No collector cash report is recorded.</p>
      )}
      {reviews.length ? (
        reviews.map(event => {
          const metadata = event.metadata as Record<string, unknown> | null;
          const verifiedPaise = Number(metadata?.verifiedPaise);
          return (
            <p key={event.id}>
              <strong>Admin verified:</strong>{" "}
              {Number.isFinite(verifiedPaise)
                ? formatINR(verifiedPaise)
                : "Amount unavailable"}{" "}
              · {new Date(event.createdAt).toLocaleString()}
              {event.note ? ` · ${event.note}` : ""}
            </p>
          );
        })
      ) : (
        <p>No admin cash review has been recorded.</p>
      )}
    </section>
  );
}
function AdminOrders({
  orders,
  riders,
  assign,
  update,
  assigning,
}: {
  orders: any[];
  riders: any[];
  assign: (o: number, r: number) => void;
  update: (o: number, s: any, r: string) => void;
  assigning: boolean;
}) {
  const [status, setStatus] = useState("");
  const [riderMap, setRiderMap] = useState<Record<number, string>>({});
  const [reasonMap, setReasonMap] = useState<Record<number, string>>({});
  const [detailId, setDetailId] = useState<number | null>(null);
  const filtered = status ? orders.filter(o => o.status === status) : orders;
  return (
    <section className="workspace-panel">
      <div className="panel-heading">
        <div>
          <h2>Orders & manual assignment</h2>
          <p>
            Admin may reject/cancel/fail only where the server allows
            transition.
          </p>
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {[
            "placed",
            "accepted",
            "preparing",
            "ready",
            "out_for_delivery",
            "delivered",
            "rejected",
            "cancelled",
            "failed_delivery",
          ].map(s => (
            <option key={s} value={s}>
              {titleCase(s)}
            </option>
          ))}
        </select>
      </div>
      {filtered.length ? (
        <div className="admin-list">
          {filtered.map(o => {
            const eligibleRiders = riders.filter(
              x =>
                x.rider.status === "approved" &&
                x.rider.available &&
                x.rider.townId === o.townId
            );
            return (
              <article className="admin-list-row" key={o.id}>
                <div>
                  <strong>
                    {o.orderNumber} · {titleCase(o.status)}
                  </strong>
                  <p>
                    Vendor #{o.vendorId} · {o.fulfillmentType} ·{" "}
                    {o.paymentMethod} ({o.paymentStatus}) ·{" "}
                    {formatINR(o.totalPaise)}
                  </p>
                  <small>
                    Order #{o.id} · town {o.townId} ·{" "}
                    {new Date(o.createdAt).toLocaleString()}
                  </small>
                </div>
                <div className="admin-order-actions">
                  <Button
                    variant="outline"
                    onClick={() => setDetailId(detailId === o.id ? null : o.id)}
                  >
                    {detailId === o.id
                      ? "Hide order detail"
                      : "Items & timeline"}
                  </Button>
                  {detailId === o.id && <AdminOrderDetail orderId={o.id} />}
                  {o.fulfillmentType === "delivery" &&
                    ["accepted", "preparing", "ready"].includes(o.status) && (
                      <div className="assignment-preview">
                        <select
                          value={riderMap[o.id] || ""}
                          onChange={e =>
                            setRiderMap(m => ({ ...m, [o.id]: e.target.value }))
                          }
                        >
                          <option value="">
                            Choose approved available rider
                          </option>
                          {eligibleRiders.map(x => (
                            <option key={x.rider.id} value={x.rider.id}>
                              {x.name || x.email} · #{x.rider.id}
                            </option>
                          ))}
                        </select>
                        <Button
                          disabled={assigning || !riderMap[o.id]}
                          onClick={() => assign(o.id, Number(riderMap[o.id]))}
                        >
                          <Bike /> Assign
                        </Button>
                      </div>
                    )}
                  {["cancelled", "rejected", "failed_delivery"].includes(
                    o.status
                  ) ? null : (
                    <>
                      <input
                        placeholder="Reason for admin status action"
                        value={reasonMap[o.id] || ""}
                        onChange={e =>
                          setReasonMap(m => ({ ...m, [o.id]: e.target.value }))
                        }
                      />
                      <div className="workflow-actions">
                        {(
                          ["cancelled", "rejected", "failed_delivery"] as const
                        ).map(s => (
                          <Button
                            key={s}
                            variant="outline"
                            disabled={!reasonMap[o.id]?.trim()}
                            onClick={() => update(o.id, s, reasonMap[o.id])}
                          >
                            {titleCase(s)}
                          </Button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyQueue
          title="No orders match"
          description="The backend returned no orders for this filter."
        />
      )}
    </section>
  );
}
function AdminOrderDetail({ orderId }: { orderId: number }) {
  const q = trpc.admin.orderDetail.useQuery({ orderId }, { retry: false });
  const utils = trpc.useUtils();
  const [resetReason, setResetReason] = useState("");
  const resetAttempts = trpc.admin.resetHandoverAttempts.useMutation({
    onSuccess: async () => {
      toast.success("Handover attempts reset after admin review");
      setResetReason("");
      await Promise.all([q.refetch(), utils.admin.orders.invalidate()]);
    },
    onError: errorToast,
  });
  if (q.isLoading)
    return (
      <div className="loading-card">Loading order items and timeline…</div>
    );
  if (q.error || !q.data)
    return (
      <div className="no-results">
        <p>{q.error?.message || "Order detail unavailable."}</p>
      </div>
    );
  const { order, items, timeline } = q.data;
  const handoverLocked =
    Boolean(order.handoverLockedAt) &&
    ["ready", "out_for_delivery"].includes(order.status);
  return (
    <section className="workspace-panel">
      {handoverLocked && (
        <form
          className="application-form"
          onSubmit={event => {
            event.preventDefault();
            if (resetReason.trim().length < 8) return;
            resetAttempts.mutate({ orderId, reason: resetReason.trim() });
          }}
        >
          <h3>Locked customer handover code</h3>
          <p>
            Five invalid handover attempts locked this order. Verify the
            customer before resetting; this administrative action is audited.
          </p>
          <label>
            Reset reason (at least 8 characters)
            <textarea
              required
              minLength={8}
              maxLength={500}
              value={resetReason}
              onChange={event => setResetReason(event.target.value)}
            />
          </label>
          <Button
            type="submit"
            disabled={resetAttempts.isPending || resetReason.trim().length < 8}
          >
            {resetAttempts.isPending ? "Resetting…" : "Reset handover attempts"}
          </Button>
          {resetAttempts.error && (
            <p role="alert">{resetAttempts.error.message}</p>
          )}
        </form>
      )}
      <h3>Order items & instructions</h3>
      {items.map(item => (
        <div className="checkout-item" key={item.id}>
          <span>
            {item.quantity} × {item.productNameSnapshot} ({item.unitSnapshot})
          </span>
          <strong>{formatINR(item.lineTotalPaise)}</strong>
        </div>
      ))}
      <p>
        <strong>Customer note:</strong> {order.notes || "None"}
      </p>
      <p>
        <strong>Substitution preference:</strong>{" "}
        {order.substitutionPreference || "None"}
      </p>
      <h3>Timeline</h3>
      {timeline.map(event => (
        <p key={event.id}>
          <strong>{titleCase(event.toStatus)}</strong> ·{" "}
          {new Date(event.createdAt).toLocaleString()}
          {event.note ? ` · ${event.note}` : ""}
        </p>
      ))}
    </section>
  );
}
function SettingsPanel({
  data,
  vendors,
  save,
  saving,
  createTown,
  creatingTown,
  toggleTown,
  createZone,
  creatingZone,
  toggleZone,
  updateTerms,
  termsSaving,
}: {
  data: any;
  vendors: any[];
  save: (key: string, value: unknown) => void;
  saving: boolean;
  createTown: (input: { slug: string; name: string; state: string }) => void;
  creatingTown: boolean;
  toggleTown: (townId: number, active: boolean) => void;
  createZone: (input: {
    townId: number;
    name: string;
    locality: string;
    postalCode?: string;
  }) => void;
  creatingZone: boolean;
  toggleZone: (zoneId: number, active: boolean) => void;
  updateTerms: (input: any) => void;
  termsSaving: boolean;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [slug, setSlug] = useState("");
  const [townName, setTownName] = useState("");
  const [stateName, setStateName] = useState("");
  const [zoneTownId, setZoneTownId] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [locality, setLocality] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [commission, setCommission] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");
  const [platformFee, setPlatformFee] = useState("");
  const [minimumOrder, setMinimumOrder] = useState("");
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [pickupEnabled, setPickupEnabled] = useState(false);
  const selected = vendors.find(
    row => row.vendor.id === Number(selectedVendor)
  )?.vendor;
  useEffect(() => {
    if (selected) {
      setCommission(String(selected.commissionBps));
      setDeliveryFee((selected.deliveryFeePaise / 100).toFixed(2));
      setPlatformFee((selected.platformFeePaise / 100).toFixed(2));
      setMinimumOrder((selected.minimumOrderPaise / 100).toFixed(2));
      setDeliveryEnabled(Boolean(selected.deliveryEnabled));
      setPickupEnabled(Boolean(selected.pickupEnabled));
    }
  }, [selected]);
  const activeTowns = data.towns.filter((t: any) => t.active);
  return (
    <div className="settings-grid">
      <section className="workspace-panel">
        <h2>Persisted platform settings</h2>
        <p>
          Generic key/value settings remain available for platform
          configuration.
        </p>
        {data.settings.length ? (
          <div className="category-admin-list">
            {data.settings.map((s: any) => (
              <div key={s.key}>
                <span>{s.key}</span>
                <small>{JSON.stringify(s.value)}</small>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No platform settings">
            The settings table has no records.
          </EmptyState>
        )}
        <form
          className="application-form"
          onSubmit={e => {
            e.preventDefault();
            let parsed: unknown = value;
            try {
              parsed = JSON.parse(value);
            } catch {}
            save(key, parsed);
          }}
        >
          <label>
            Setting key
            <input
              required
              maxLength={100}
              value={key}
              onChange={e => setKey(e.target.value)}
            />
          </label>
          <label>
            Value (JSON or text)
            <textarea
              required
              value={value}
              onChange={e => setValue(e.target.value)}
            />
          </label>
          <Button disabled={saving}>Persist setting</Button>
        </form>
      </section>
      <section className="workspace-panel">
        <h2>Towns</h2>
        <p>Create service areas and persist activation status.</p>
        <form
          className="application-form"
          onSubmit={e => {
            e.preventDefault();
            createTown({ slug, name: townName, state: stateName });
            setSlug("");
            setTownName("");
            setStateName("");
          }}
        >
          <label>
            Town name
            <input
              required
              maxLength={160}
              value={townName}
              onChange={e => setTownName(e.target.value)}
            />
          </label>
          <label>
            Slug (lowercase letters, numbers and hyphens)
            <input
              required
              pattern="[a-z0-9-]+"
              maxLength={96}
              value={slug}
              onChange={e => setSlug(e.target.value)}
            />
          </label>
          <label>
            State
            <input
              required
              maxLength={100}
              value={stateName}
              onChange={e => setStateName(e.target.value)}
            />
          </label>
          <Button disabled={creatingTown}>Create town</Button>
        </form>
        <div className="category-admin-list">
          {data.towns.length ? (
            data.towns.map((t: any) => (
              <div key={t.id}>
                <span>
                  #{t.id} {t.name}, {t.state}
                </span>
                <small>
                  {t.active ? "Active" : "Inactive"}{" "}
                  <Button
                    variant="outline"
                    onClick={() => toggleTown(t.id, !t.active)}
                  >
                    {t.active ? "Deactivate" : "Activate"}
                  </Button>
                </small>
              </div>
            ))
          ) : (
            <EmptyState title="No towns">
              Create the first town to begin setting coverage.
            </EmptyState>
          )}
        </div>
      </section>
      <section className="workspace-panel">
        <h2>Service zones</h2>
        <p>
          New zones require an active town; status shown below reflects the
          saved backend record.
        </p>
        <form
          className="application-form"
          onSubmit={e => {
            e.preventDefault();
            createZone({
              townId: Number(zoneTownId),
              name: zoneName,
              locality,
              ...(postalCode ? { postalCode } : {}),
            });
            setZoneName("");
            setLocality("");
            setPostalCode("");
          }}
        >
          <label>
            Active town
            <select
              required
              value={zoneTownId}
              onChange={e => setZoneTownId(e.target.value)}
            >
              <option value="">Choose town</option>
              {activeTowns.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}, {t.state}
                </option>
              ))}
            </select>
          </label>
          <label>
            Service-zone name
            <input
              required
              maxLength={160}
              value={zoneName}
              onChange={e => setZoneName(e.target.value)}
            />
          </label>
          <label>
            Locality
            <input
              required
              maxLength={160}
              value={locality}
              onChange={e => setLocality(e.target.value)}
            />
          </label>
          <label>
            Postal code (optional)
            <input
              maxLength={12}
              value={postalCode}
              onChange={e => setPostalCode(e.target.value)}
            />
          </label>
          <Button disabled={creatingZone || !activeTowns.length}>
            Create service zone
          </Button>
        </form>
        <div className="category-admin-list">
          {data.zones.length ? (
            data.zones.map((z: any) => {
              const town = data.towns.find((t: any) => t.id === z.townId);
              return (
                <div key={z.id}>
                  <span>
                    #{z.id} {z.locality}, {z.name} ·{" "}
                    {town?.name || `Town #${z.townId}`}
                  </span>
                  <small>
                    {z.postalCode || "No postal code"} ·{" "}
                    {z.active ? "Active" : "Inactive"}{" "}
                    <Button
                      variant="outline"
                      onClick={() => toggleZone(z.id, !z.active)}
                    >
                      {z.active ? "Deactivate" : "Activate"}
                    </Button>
                  </small>
                </div>
              );
            })
          ) : (
            <EmptyState title="No service zones">
              Add a zone under an active town.
            </EmptyState>
          )}
        </div>
      </section>
      <section className="workspace-panel">
        <h2>Vendor fees & commission</h2>
        <p>
          Amounts below are entered in rupees; commission is a rate in basis
          points (100 bps = 1%). Backend limits are enforced on save.
        </p>
        <form
          className="application-form"
          onSubmit={e => {
            e.preventDefault();
            if (!selected) return;
            updateTerms({
              vendorId: selected.id,
              commissionBps: Number(commission),
              deliveryFeePaise: Math.round(Number(deliveryFee) * 100),
              platformFeePaise: Math.round(Number(platformFee) * 100),
              minimumOrderPaise: Math.round(Number(minimumOrder) * 100),
              deliveryEnabled,
              pickupEnabled,
            });
          }}
        >
          <label>
            Existing vendor
            <select
              required
              value={selectedVendor}
              onChange={e => setSelectedVendor(e.target.value)}
            >
              <option value="">Choose vendor</option>
              {vendors.map(({ vendor, ownerName }: any) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.shopName} · #{vendor.id} · {titleCase(vendor.status)}
                  {ownerName ? ` · ${ownerName}` : ""}
                </option>
              ))}
            </select>
          </label>
          {selected && (
            <>
              <label>
                Commission (basis points, 0–3000)
                <input
                  required
                  type="number"
                  min="0"
                  max="3000"
                  step="1"
                  value={commission}
                  onChange={e => setCommission(e.target.value)}
                />
              </label>
              <label>
                Delivery fee (₹, up to ₹500)
                <input
                  required
                  type="number"
                  min="0"
                  max="500"
                  step="0.01"
                  value={deliveryFee}
                  onChange={e => setDeliveryFee(e.target.value)}
                />
              </label>
              <label>
                Platform fee (₹, up to ₹50)
                <input
                  required
                  type="number"
                  min="0"
                  max="50"
                  step="0.01"
                  value={platformFee}
                  onChange={e => setPlatformFee(e.target.value)}
                />
              </label>
              <label>
                Minimum order (₹, up to ₹1,000,000)
                <input
                  required
                  type="number"
                  min="0"
                  max="1000000"
                  step="0.01"
                  value={minimumOrder}
                  onChange={e => setMinimumOrder(e.target.value)}
                />
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={deliveryEnabled}
                  onChange={e => setDeliveryEnabled(e.target.checked)}
                />
                Delivery enabled
              </label>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={pickupEnabled}
                  onChange={e => setPickupEnabled(e.target.checked)}
                />
                Pickup enabled
              </label>
              <Button disabled={termsSaving}>Save vendor terms</Button>
            </>
          )}
        </form>
        {!vendors.length && (
          <EmptyState title="No vendors">
            Vendor records will appear here when applications exist.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
