import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import {
  hasMobileSession,
  assertMobileOrigin,
  MobileAuthError,
} from "../auth/mobile-auth";
import { TRPCError } from "@trpc/server";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    if (hasMobileSession(opts.req) && opts.req.method !== "GET")
      assertMobileOrigin(opts.req);
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    if (error instanceof MobileAuthError)
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Open MyTown directly and try again.",
      });
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
