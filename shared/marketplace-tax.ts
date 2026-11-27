/** Protocol v2: integer paise, GST basis points; half-up rounding once per line. */
export type MarketplaceTax = { schema: 1; netUnitPaise: number; offerNetUnitPaise: number | null; gstBps: number; hsn: string | null };
export function sameMarketplaceTax(a: MarketplaceTax | undefined, b: unknown): b is MarketplaceTax {
  return !!a && !!b && typeof b === 'object' && !Array.isArray(b) && Object.keys(b).length === 5 &&
    (['schema','netUnitPaise','offerNetUnitPaise','gstBps','hsn'] as const).every(key => a[key] === (b as MarketplaceTax)[key]);
}
export function quoteMarketplaceTax(netUnitPaise: number, gstBps: number, quantity: number) {
  if (!Number.isSafeInteger(netUnitPaise) || netUnitPaise <= 0 || netUnitPaise > 100000000 || !Number.isInteger(gstBps) || gstBps < 0 || gstBps > 10000 || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw Error("Invalid marketplace tax snapshot");
  const net = BigInt(netUnitPaise) * BigInt(quantity);
  const tax = (net * BigInt(gstBps) + 5000n) / 10000n;
  if (net + tax > 2000000000n) throw Error("Marketplace amount exceeds supported limit");
  return { taxablePaise: Number(net), taxPaise: Number(tax), totalPaise: Number(net + tax) };
}
