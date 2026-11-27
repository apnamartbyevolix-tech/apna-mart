import { describe, expect, it } from "vitest";
import { quoteMarketplaceTax, sameMarketplaceTax } from "./marketplace-tax";
describe("signed marketplace tax arithmetic", () => {
  it.each([
    [10000,1800,2,20000,3600,23600], [3,500,100,300,15,315],
    [1,5000,1,1,1,2], [9999,0,3,29997,0,29997], [250,250,4,1000,25,1025],
  ])("rounds a whole line in integer paise", (net,bps,qty,taxable,tax,total) => expect(quoteMarketplaceTax(net,bps,qty)).toEqual({ taxablePaise: taxable, taxPaise: tax, totalPaise: total }));
  it.each([[0,0,1],[1,-1,1],[1,10001,1],[1,5.5,1],[1,0,1.5],[100000000,10000,10000]])("rejects malformed or overflowing snapshots", (net,bps,qty) => expect(() => quoteMarketplaceTax(net,bps,qty)).toThrow());
});

describe('tax snapshot identity across PostgreSQL JSONB', () => {
  const tax = { schema: 1 as const, netUnitPaise: 3, offerNetUnitPaise: null, gstBps: 500, hsn: '1006' };
  it('accepts reordered fields but rejects any changed or extra value', () => {
    expect(sameMarketplaceTax(tax, { hsn: '1006', gstBps: 500, offerNetUnitPaise: null, netUnitPaise: 3, schema: 1 })).toBe(true);
    for (const value of [{ ...tax, gstBps: 0 }, { ...tax, hsn: '9999' }, { ...tax, extra: true }, null]) expect(sameMarketplaceTax(tax, value)).toBe(false);
  });
});
