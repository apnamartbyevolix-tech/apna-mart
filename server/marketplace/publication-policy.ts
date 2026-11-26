import { sql, type SQLWrapper } from "drizzle-orm";
import { isReviewDemo } from "../auth/review-demo-context";
import { sandboxEnabled, productionConnector } from "../integrations/apna-galla/config";

// A successful signed verification is briefly reusable for discovery. Checkout
// still verifies the merchant and reserves authoritative ERP stock independently.
export const ELIGIBILITY_FRESH_SECONDS = 15;
export const connectedCatalogue = () => sandboxEnabled() && !isReviewDemo();

export function linkedSellerCondition(vendorId: SQLWrapper) {
  return sql`EXISTS (
    SELECT 1 FROM apna_links publication_link
    WHERE publication_link.vendor_id = ${vendorId}
      AND publication_link.live = true
      AND publication_link.expires_at > (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
      AND publication_link.verified_at >= (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '15 seconds'
  )`;
}

export function publishedSellerCondition(vendorId: SQLWrapper, isDemo: SQLWrapper) {
  if (!connectedCatalogue()) return undefined;
  return productionConnector() ? sql`${linkedSellerCondition(vendorId)} AND ${isDemo} = false` : linkedSellerCondition(vendorId);
}

export function publishedProductCondition(productId: SQLWrapper, vendorId: SQLWrapper, isDemo: SQLWrapper) {
  if (!connectedCatalogue()) return undefined;
  return sql`${productionConnector() ? sql`${isDemo} = false` : sql`true`} AND EXISTS (
    SELECT 1 FROM apna_products publication_product
    WHERE publication_product.product_id = ${productId}
      AND publication_product.vendor_id = ${vendorId}
  )`;
}
