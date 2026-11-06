import { AsyncLocalStorage } from "node:async_hooks";
/** Internal bridge-only transaction and seller scope. Never supplied by a browser. */
export const vendorBridgeContext = new AsyncLocalStorage<{
  db: any;
  vendorId: number;
}>();
