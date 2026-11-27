import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";

/** The signed vendor identity supplies vendorId; retain the durable wire key/body. */
export async function retryOrderSync(tx: any, orderId: number, vendorId: number) {
  const owned = await tx.execute(sql`SELECT id FROM orders WHERE id=${orderId} AND "vendorId"=${vendorId} FOR UPDATE`);
  if (!owned.rows.length) throw new TRPCError({ code: "NOT_FOUND" });
  const result = await tx.execute(sql`UPDATE apna_outbox SET attempts=0,next_at=now(),last_error=NULL
    WHERE order_id=${orderId} AND NOT done AND attempts>0 AND (lease_until IS NULL OR lease_until<now()) RETURNING id`);
  return { queued: result.rows.length > 0 };
}
