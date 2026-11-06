import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { MarketProvider, MarketShell } from "./components/MarketChrome";
import { ThemeProvider } from "./contexts/ThemeContext";

const Home = lazy(() => import("./pages/CustomerDiscovery"));
const OffersPage = lazy(() =>
  import("./pages/CustomerDiscovery").then(m => ({ default: m.OffersPage }))
);
const CategoriesPage = lazy(() =>
  import("./pages/CustomerDiscovery").then(m => ({ default: m.CategoriesPage }))
);
const SearchPage = lazy(() =>
  import("./pages/CustomerDiscovery").then(module => ({
    default: module.CustomerSearchPage,
  }))
);
const CategoryPage = lazy(() =>
  import("./pages/MarketPages").then(module => ({
    default: module.CategoryPage,
  }))
);
const ProductPage = lazy(() =>
  import("./pages/MarketPages").then(module => ({
    default: module.ProductPage,
  }))
);
const ShopPage = lazy(() =>
  import("./pages/MarketPages").then(module => ({ default: module.ShopPage }))
);
const AccountPage = lazy(() =>
  import("./pages/CustomerPages").then(module => ({
    default: module.AccountPage,
  }))
);
const CartPage = lazy(() =>
  import("./pages/CustomerPages").then(module => ({ default: module.CartPage }))
);
const CheckoutPage = lazy(() =>
  import("./pages/CustomerPages").then(module => ({
    default: module.CheckoutPage,
  }))
);
const OrderDetailPage = lazy(() =>
  import("./pages/CustomerPages").then(module => ({
    default: module.OrderDetailPage,
  }))
);
const OrdersPage = lazy(() =>
  import("./pages/CustomerPages").then(module => ({
    default: module.OrdersPage,
  }))
);
const FavoritesPage = lazy(() =>
  import("./pages/CustomerPages").then(module => ({
    default: module.FavoritesPage,
  }))
);
const SignInPage = lazy(() =>
  import("./pages/CustomerPages").then(module => ({
    default: module.SignInPage,
  }))
);
const SupportPage = lazy(() => import("./pages/SupportPage"));

function Router() {
  return (
    <MarketProvider>
      <MarketShell>
        <Suspense
          fallback={
            <div className="page-loading" role="status">
              Opening local shops…
            </div>
          }
        >
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/search" component={SearchPage} />
            <Route path="/offers" component={OffersPage} />
            <Route path="/categories" component={CategoriesPage} />
            <Route path="/category/:slug">
              {params => <CategoryPage slug={params.slug} />}
            </Route>
            <Route path="/shop/:id">
              {params => <ShopPage id={params.id} />}
            </Route>
            <Route path="/product/:id">
              {params => <ProductPage id={params.id} />}
            </Route>
            <Route path="/cart" component={CartPage} />
            <Route path="/checkout" component={CheckoutPage} />
            <Route path="/orders" component={OrdersPage} />
            <Route path="/orders/:id">
              {params => <OrderDetailPage id={params.id} />}
            </Route>
            <Route path="/favorites" component={FavoritesPage} />
            <Route path="/support" component={SupportPage} />
            <Route path="/account" component={AccountPage} />
            <Route path="/login" component={SignInPage} />
            <Route component={NotFound} />
          </Switch>
        </Suspense>
      </MarketShell>
    </MarketProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
