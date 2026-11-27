import { useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import type { RouterInputs } from "@/lib/marketplace";

/** Refresh only at a visible offer boundary, rather than polling an idle page. */
export function useOfferBoundary(rows: { offer?: { startsAt: string; endsAt: string } | null }[], refresh: () => unknown) {
  const deadline = Math.min(...rows.flatMap(row => row.offer ? [Date.parse(row.offer.startsAt), Date.parse(row.offer.endsAt)] : []).filter(at => at > Date.now()));
  useEffect(() => {
    if (!Number.isFinite(deadline)) return;
    const timer = setTimeout(() => { void refresh(); }, Math.min(2147483647, Math.max(100, deadline - Date.now() + 50)));
    return () => clearTimeout(timer);
  }, [deadline, refresh]);
}

export function useCatalogue(input: RouterInputs["marketplace"]["browse"], enabled = true) {
  const query = trpc.marketplace.browse.useInfiniteQuery(input, {
    enabled: enabled && input.townId > 0 && input.zoneId > 0,
    retry: false,
    refetchOnWindowFocus: true,
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
  // A price/offer can change between requests. Never render the same item twice.
  const products = [...new Map((query.data?.pages.flatMap(page => page.products) || []).map(product => [product.id, product])).values()];
  const shops = [...new Map((query.data?.pages.flatMap(page => page.shops) || []).map(shop => [shop.id, shop])).values()];
  useOfferBoundary(products, query.refetch);
  return { ...query, products, shops };
}

export function CatalogueMore({ query }: { query: { hasNextPage: boolean; isFetchingNextPage: boolean; isFetchNextPageError: boolean; fetchNextPage: () => unknown } }) {
  const { t } = useLanguage();
  return <>
    {query.hasNextPage && <button className="mart-load-more" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{t(query.isFetchingNextPage ? "Loading…" : "Load more")}</button>}
    {query.isFetchNextPageError && <p role="status">{t("Could not load more items. Please try again.")}</p>}
  </>;
}
