import express, { type Express } from "express";
import {verifyConnection} from './link-auth';
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { users, vendorProfiles } from "../../../drizzle/schema";
import { appRouter } from "../../routers";
import { assertSandbox, sandboxEnabled } from "./sandbox";
import { vendorBridgeContext } from "../../marketplace/vendor-context";
import { withinShopHours, validShopHours } from "../../../shared/shop-hours";

const requestSchema = z
  .object({
    revision: z.literal("1.3-sandbox"),
    merchantId: z.string().uuid(),
    operation: z.enum([
      "overview",
      "orders",
      "detail",
      "status",
      "return",
      "settings",
    ]),
    input: z.unknown().optional(),
  })
  .strict();
export function registerApnaVendor(app: Express) {
  if (!sandboxEnabled()) return;
  assertSandbox();
  app.post(
    "/api/internal/apna/vendor",
    express.raw({ type: "application/json", limit: "64kb" }),
    async (req, res) => {
      try {
        const raw = req.body as Buffer,
          ts = String(req.headers["x-apna-galla-timestamp"] || ""),
          signature = String(req.headers["x-apna-galla-signature"] || ""),
          key = String(req.headers["x-apna-galla-key"] || ""),
          requestKey = String(req.headers["idempotency-key"] || "");
        const equal = (a: string, b: string) =>
          a.length === b.length &&
          timingSafeEqual(Buffer.from(a), Buffer.from(b));
        if (
          !Buffer.isBuffer(raw) ||
          raw.length > 65536 ||
          !/^\d{10}$/.test(ts) ||
          Math.abs(Date.now() / 1000 - Number(ts)) > 120 ||
          !equal(key, process.env.APNA_SANDBOX_KEY!) ||
          !/^[0-9a-f]{64}$/.test(signature) ||
          !equal(
            signature,
            createHmac("sha256", process.env.APNA_SANDBOX_SECRET!)
              .update(ts + ".")
              .update(raw)
              .digest("hex")
          ) ||
          !z.string().uuid().safeParse(requestKey).success
        ) {
          res.status(401).json({ message: "Invalid sandbox authentication" });
          return;
        }
        try{verifyConnection('apna',req.method,req.originalUrl,raw,req.headers);}catch{res.status(401).json({message:'Invalid server signature'});return;}
        const b = requestSchema.parse(JSON.parse(raw.toString("utf8"))),
          db = await getDb();
        if (!db) throw Error("Unavailable");
        const mutating = ["status", "return", "settings"].includes(b.operation);
        const fingerprint = createHash("sha256").update(raw).digest("hex");
        const result = await db.transaction(async tx => {
          // Lock the validated merchant mapping: customer IDs or seller IDs from the browser are never trusted.
          const [links] = await tx.execute(
              sql`SELECT * FROM apna_links WHERE merchant_id=${b.merchantId} FOR UPDATE`
            ),
            link = (links as unknown as any[])[0];
          if (!link)
            throw Object.assign(Error("Shop connection not found"), {
              httpStatus: 403,
            });
          const [prior] = await tx.execute(
              sql`SELECT * FROM apna_vendor_requests WHERE merchant_id=${b.merchantId} AND request_key=${requestKey}`
            ),
            previous = (prior as unknown as any[])[0];
          if (mutating && previous) {
            if (previous.fingerprint !== fingerprint)
              throw Object.assign(
                Error("Request key belongs to another action"),
                { httpStatus: 409 }
              );
            return typeof previous.response === "string"
              ? JSON.parse(previous.response)
              : previous.response;
          }
          const [vendor] = await tx
            .select()
            .from(vendorProfiles)
            .where(eq(vendorProfiles.id, link.vendor_id));
          const [user] = await tx
            .select()
            .from(users)
            .where(eq(users.id, vendor.userId!));
          if (!user)
            throw Object.assign(Error("Seller identity is unavailable"), {
              httpStatus: 403,
            });
          return vendorBridgeContext.run(
            { db: tx, vendorId: vendor.id },
            async () => {
              const caller = appRouter.createCaller({ req, res, user } as any);
              let output: unknown;
              try {
                switch (b.operation) {
                  case "overview":
                    {
                      const dashboard = await caller.vendor.dashboard();
                      output = {
                        ...dashboard,
                        outsideOpeningHours: !withinShopHours(
                          dashboard.vendor.settings
                        ),
                      };
                    }
                    break;
                  case "orders": {
                    const list = (
                      await caller.vendor.orders(b.input as any)
                    ).slice(0, 100);
                    const [states] = await tx.execute(
                      sql`SELECT c.order_id,c.state FROM apna_checkouts c JOIN orders o ON o.id=c.order_id WHERE o.vendorId=${vendor.id}`
                    );
                    output = list.map(o => ({
                      ...o,
                      sync_state:
                        (states as unknown as any[]).find(
                          s => s.order_id === o.id
                        )?.state || null,
                    }));
                    break;
                  }
                  case "detail":
                    output = await caller.vendor.orderDetail(b.input as any);
                    break;
                  case "status":
                    output = await caller.vendor.updateOrderStatus(
                      b.input as any
                    );
                    break;
                  case "return":
                    output = await caller.vendor.recordReturnRecovery(
                      b.input as any
                    );
                    break;
                  case "settings": {
                    const input = z
                      .object({
                        deliveryEnabled: z.boolean(),
                        pickupEnabled: z.boolean(),
                        openingTime: z.string().nullable().optional(),
                        closingTime: z.string().nullable().optional(),
                        preparationMinutes: z.number().int().min(5).max(240),
                        minimumOrderPaise: z
                          .number()
                          .int()
                          .min(0)
                          .max(100000000),
                      })
                      .strict()
                      .refine(
                        x => x.deliveryEnabled || x.pickupEnabled,
                        "Keep delivery or pickup enabled"
                      )
                      .parse(b.input);
                    if (!validShopHours(input)) throw new z.ZodError([]);
                    output = await caller.vendor.updateDeliverySettings(input);
                    break;
                  }
                }
              } catch (error: any) {
                const status = (
                  {
                    BAD_REQUEST: 400,
                    NOT_FOUND: 404,
                    FORBIDDEN: 403,
                    CONFLICT: 409,
                    PRECONDITION_FAILED: 409,
                    TOO_MANY_REQUESTS: 429,
                  } as Record<string, number>
                )[error?.code];
                if (!status) throw error;
                output = { __bridgeError: { status, message: error.message } };
              }
              const safe = JSON.parse(JSON.stringify(output));
              if (mutating)
                await tx.execute(
                  sql`INSERT INTO apna_vendor_requests(merchant_id,request_key,fingerprint,response) VALUES(${b.merchantId},${requestKey},${fingerprint},${JSON.stringify(safe)})`
                );
              return safe;
            }
          );
        });
        if ((result as any)?.__bridgeError) {
          res
            .status((result as any).__bridgeError.status)
            .json({ message: (result as any).__bridgeError.message });
          return;
        }
        res.json({ success: true, data: result });
      } catch (e: any) {
        const codes: Record<string, number> = {
          BAD_REQUEST: 400,
          NOT_FOUND: 404,
          FORBIDDEN: 403,
          CONFLICT: 409,
          PRECONDITION_FAILED: 409,
        };
        const status =
          e?.httpStatus ||
          codes[e?.code] ||
          (e instanceof z.ZodError ? 400 : 503);
        res.status(status).json({
          message:
            status < 500
              ? e instanceof z.ZodError
                ? "Check the order details and try again"
                : e.message
              : "Order update could not be confirmed. Retry the same action safely.",
        });
      }
    }
  );
}
