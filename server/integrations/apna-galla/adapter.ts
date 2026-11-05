/** Internal types copied from contract v1.1.0-draft; NOT invented HTTP schemas. */
export interface IApnaGallaAdapter {
  verifyMerchant(merchantId: string): Promise<{ isValid: boolean; tier: string; expiresAt: Date }>;
  reserveStock(input: { orderNumber: string; merchantId: string; items: Array<{ sku: string; quantity: number }> }): Promise<{ reservationId: string; success: boolean }>;
  commitStock(reservationId: string, orderNumber: string): Promise<{ success: boolean }>;
  releaseStock(reservationId: string, reason: string): Promise<void>;
  postSale(order: unknown): Promise<{ invoiceNumber?: string; success: boolean }>;
}

export class IntegrationUnavailable extends Error {
  constructor() { super('Apna Galla sandbox integration awaits an approved wire contract and sandbox configuration.'); }
}

export class DisabledApnaGallaAdapter implements IApnaGallaAdapter {
  async verifyMerchant(_merchantId: string): Promise<never> { throw new IntegrationUnavailable(); }
  async reserveStock(_input: Parameters<IApnaGallaAdapter['reserveStock']>[0]): Promise<never> { throw new IntegrationUnavailable(); }
  async commitStock(_reservationId: string, _orderNumber: string): Promise<never> { throw new IntegrationUnavailable(); }
  async releaseStock(_reservationId: string, _reason: string): Promise<never> { throw new IntegrationUnavailable(); }
  async postSale(_order: unknown): Promise<never> { throw new IntegrationUnavailable(); }
}

export const APNA_ROUTES = {
  verifyMerchant: '/api/v1/merchants/verify',
  reserveStock: '/api/v1/inventory/reserve',
  commitStock: '/api/v1/inventory/commit',
  releaseStock: '/api/v1/inventory/release',
  postSale: '/api/v1/orders/sale-post',
} as const;
export type Operation = keyof typeof APNA_ROUTES;

/** This is a server policy snapshot, not a claim that these are API response fields. */
export function mayPubliclyList(snapshot: {
  source: 'verified' | 'local-mock';
  isValid: boolean;
  marketplaceEnabled?: boolean;
  tier: string;
  expiresAt: Date;
} | undefined, now = new Date()): boolean {
  return Boolean(snapshot && snapshot.source === 'verified' && snapshot.isValid === true &&
    snapshot.marketplaceEnabled === true && snapshot.tier.trim() &&
    Number.isFinite(snapshot.expiresAt.getTime()) && snapshot.expiresAt > now);
}

export function connectorStatus() {
  return { mode: 'disabled' as const, publicSelling: false, reason: 'Approved sandbox URL, HTTP schemas, identity/unit mapping and eligibility rules are required.' };
}

// Do not activate from an environment toggle: wire schemas/sign-off are missing.
export function getApnaGallaAdapter(): IApnaGallaAdapter { return new DisabledApnaGallaAdapter(); }
